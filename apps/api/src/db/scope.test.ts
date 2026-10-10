import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { seedUserWithWorkspace, testDatabase } from '../test/db';
import { auditLogs, workspaceMembers, workspaces } from './schema';
import { runInWorkspace } from './scope';

const { db, pool } = testDatabase();

/** Drizzle wraps the Postgres error; match the original message. */
const pgError = (message: RegExp) => ({ cause: { message: expect.stringMatching(message) } });
afterAll(() => pool.end());

describe('runInWorkspace', () => {
  it('shows only the scoped Workspace to queries without any filter', async () => {
    const a = await seedUserWithWorkspace(db, 'A');
    const b = await seedUserWithWorkspace(db, 'B');

    const seen = await runInWorkspace(db, a, async (tx) => ({
      workspaces: await tx.select().from(workspaces),
      members: await tx.select().from(workspaceMembers),
    }));

    expect(seen.workspaces.map((w) => w.id)).toEqual([a.workspaceId]);
    expect(seen.members.map((m) => m.userId)).toEqual([a.userId]);
    expect(seen.workspaces.map((w) => w.id)).not.toContain(b.workspaceId);
  });

  it('cannot change another Workspace with an unfiltered write', async () => {
    const a = await seedUserWithWorkspace(db, 'A');
    const b = await seedUserWithWorkspace(db, 'B');

    await runInWorkspace(db, a, (tx) => tx.update(workspaces).set({ name: 'hacked' }));
    await runInWorkspace(db, a, (tx) =>
      tx
        .delete(workspaceMembers)
        .where(sql`true`)
        .returning(),
    );

    const [bAfter] = await db
      .select()
      .from(workspaces)
      .where(sql`${workspaces.id} = ${b.workspaceId}`);
    expect(bAfter?.name).toBe('B');
    const bMembers = await db
      .select()
      .from(workspaceMembers)
      .where(sql`${workspaceMembers.workspaceId} = ${b.workspaceId}`);
    expect(bMembers).toHaveLength(1);
  });

  it('sees nothing when scoped to a Workspace the User is not a Member of', async () => {
    const a = await seedUserWithWorkspace(db, 'A');
    const b = await seedUserWithWorkspace(db, 'B');

    const seen = await runInWorkspace(db, { userId: a.userId, workspaceId: b.workspaceId }, (tx) =>
      tx.select().from(workspaces),
    );
    expect(seen).toEqual([]);

    await expect(
      runInWorkspace(db, { userId: a.userId, workspaceId: b.workspaceId }, (tx) =>
        tx.insert(auditLogs).values({ workspaceId: b.workspaceId, action: 'forged' }),
      ),
    ).rejects.toMatchObject(pgError(/row-level security/));
  });

  it('has no access to identity tables', async () => {
    const a = await seedUserWithWorkspace(db, 'A');
    await expect(
      runInWorkspace(db, a, (tx) => tx.execute(sql`SELECT * FROM users`)),
    ).rejects.toMatchObject(pgError(/permission denied/));
  });

  it('keeps audit logs append-only', async () => {
    const a = await seedUserWithWorkspace(db, 'A');
    await runInWorkspace(db, a, (tx) =>
      tx.insert(auditLogs).values({ workspaceId: a.workspaceId, action: 'test' }),
    );
    await expect(
      runInWorkspace(db, a, (tx) => tx.update(auditLogs).set({ action: 'changed' })),
    ).rejects.toMatchObject(pgError(/permission denied/));
  });
});

describe('row-level security coverage', () => {
  it('is enabled with a policy on every table that has a workspace_id', async () => {
    const { rows } = await pool.query<{ table: string; rls: boolean; policies: number }>(`
      SELECT c.relname AS table, c.relrowsecurity AS rls,
             (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r'
        AND (c.relname = 'workspaces' OR EXISTS (
          SELECT FROM pg_attribute a
          WHERE a.attrelid = c.oid AND a.attname = 'workspace_id' AND NOT a.attisdropped))
    `);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.filter((r) => !r.rls || r.policies === 0).map((r) => r.table)).toEqual([]);
  });
});
