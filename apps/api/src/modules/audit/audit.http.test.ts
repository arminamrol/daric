import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';
import { joined } from '../../test/sharing';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

describe('Audit log viewer', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  const audit = (user: { token: string }, workspaceId: string, query = '') =>
    call(t.url, 'GET', `/v1/workspaces/${workspaceId}/audit${query}`, { token: user.token });

  it("show the Owner their Workspace's log, newest first, with who did it", async () => {
    const owner = await registerUser(t.url);
    const admin = await joined(t, owner, 'ADMIN');
    await call(t.url, 'PATCH', `/v1/workspaces/${owner.workspaceId}`, {
      token: admin.token,
      body: { name: 'Home' },
    });

    const res = await audit(owner, owner.workspaceId);
    expect(res.status).toBe(200);
    expect(res.body.next).toBeNull();
    expect(res.body.entries.map((e: { action: string }) => e.action)).toEqual([
      'workspace.update',
      'consent.grant',
      'invitation.accept',
      'invitation.create',
      'auth.register',
    ]);
    expect(res.body.entries[0]).toEqual({
      id: expect.any(String),
      action: 'workspace.update',
      actorEmail: admin.email,
      metadata: { fields: ['name'] },
      createdAt: expect.any(String),
    });
    expect(res.body.entries.at(-1).actorEmail).toBe(owner.email);
  });

  it('page through older entries', async () => {
    const owner = await registerUser(t.url);
    const base = Date.now();
    await db.insert(auditLogs).values(
      Array.from({ length: 5 }, (_, i) => ({
        workspaceId: owner.workspaceId,
        actorUserId: owner.userId,
        action: 'label.create',
        metadata: { n: i },
        createdAt: new Date(base + (i + 1) * 1000),
      })),
    );
    const first = await audit(owner, owner.workspaceId, '?limit=2');
    expect(first.body.entries.map((e: { metadata: { n: number } }) => e.metadata.n)).toEqual([
      4, 3,
    ]);
    const second = await audit(owner, owner.workspaceId, `?limit=2&before=${first.body.next}`);
    expect(second.body.entries.map((e: { metadata: { n: number } }) => e.metadata.n)).toEqual([
      2, 1,
    ]);
    const third = await audit(owner, owner.workspaceId, `?limit=2&before=${second.body.next}`);
    expect(third.body.entries).toHaveLength(2);
    expect(third.body.entries[1].action).toBe('auth.register');
    expect(third.body.next).toBeNull();
  });

  it.each(['ADMIN', 'MEMBER', 'VIEWER'])('stay closed to a %s', async (role) => {
    const owner = await registerUser(t.url);
    const user = await joined(t, owner, role);
    expect((await audit(user, owner.workspaceId)).status).toBe(403);
  });

  it("never show another Workspace's entries", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);
    expect((await audit(a, b.workspaceId)).status).toBe(404);
    const own = await audit(a, a.workspaceId);
    expect(own.body.entries).toHaveLength(1);
  });

  it('reject a malformed page', async () => {
    const a = await registerUser(t.url);
    expect((await audit(a, a.workspaceId, '?limit=1000')).status).toBe(400);
    expect((await audit(a, a.workspaceId, '?before=nope')).status).toBe(400);
  });
});
