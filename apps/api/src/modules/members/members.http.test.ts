import type { WorkspaceRole } from '@daric/core';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, userConsents } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';
import { addMember, joined, membersPath, type TestUser } from '../../test/sharing';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

type Crew = Record<'owner' | 'admin' | 'admin2' | 'member' | 'viewer', TestUser> & {
  workspaceId: string;
  /** Membership ids by person. */
  ids: Record<'owner' | 'admin' | 'admin2' | 'member' | 'viewer', string>;
};

describe('Members', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  /** A Workspace with one person in every Role, and a second Admin. */
  async function crew(): Promise<Crew> {
    const owner = await registerUser(t.url);
    const people = {
      admin: await registerUser(t.url),
      admin2: await registerUser(t.url),
      member: await registerUser(t.url),
      viewer: await registerUser(t.url),
    };
    const roles: Record<keyof typeof people, WorkspaceRole> = {
      admin: 'ADMIN',
      admin2: 'ADMIN',
      member: 'MEMBER',
      viewer: 'VIEWER',
    };
    const list = await call(t.url, 'GET', membersPath(owner.workspaceId), { token: owner.token });
    const ids = { owner: list.body[0].id as string } as Crew['ids'];
    for (const key of Object.keys(people) as (keyof typeof people)[]) {
      ids[key] = await addMember(db, owner.workspaceId, people[key], roles[key]);
    }
    return { owner, ...people, workspaceId: owner.workspaceId, ids };
  }

  const changeRole = (c: Crew, actor: TestUser, target: keyof Crew['ids'], role: string) =>
    call(t.url, 'PATCH', `${membersPath(c.workspaceId)}/${c.ids[target]}`, {
      token: actor.token,
      body: { role },
    });

  const remove = (c: Crew, actor: TestUser, target: keyof Crew['ids']) =>
    call(t.url, 'DELETE', `${membersPath(c.workspaceId)}/${c.ids[target]}`, {
      token: actor.token,
    });

  it.each(['owner', 'admin', 'member', 'viewer'] as const)(
    'are listed to the %s in the order they joined, with emails and Roles',
    async (who) => {
      const c = await crew();
      const res = await call(t.url, 'GET', membersPath(c.workspaceId), { token: c[who].token });
      expect(res.status).toBe(200);
      expect(res.body.map((m: { email: string; role: string }) => [m.email, m.role])).toEqual([
        [c.owner.email, 'OWNER'],
        [c.admin.email, 'ADMIN'],
        [c.admin2.email, 'ADMIN'],
        [c.member.email, 'MEMBER'],
        [c.viewer.email, 'VIEWER'],
      ]);
      expect(res.body[0]).toMatchObject({ userId: c.owner.userId, id: c.ids.owner });
    },
  );

  // The role matrix (docs/plan.md): the Owner manages everyone else; an Admin
  // manages Members and Viewers and gives only those Roles; others manage nobody.
  it.each([
    ['owner', 'admin', 'MEMBER', 200],
    ['owner', 'member', 'ADMIN', 200],
    ['owner', 'viewer', 'MEMBER', 200],
    ['owner', 'owner', 'ADMIN', 403],
    ['owner', 'member', 'OWNER', 400],
    ['admin', 'member', 'VIEWER', 200],
    ['admin', 'viewer', 'MEMBER', 200],
    ['admin', 'member', 'ADMIN', 403],
    ['admin', 'admin2', 'MEMBER', 403],
    ['admin', 'admin', 'MEMBER', 403],
    ['admin', 'owner', 'ADMIN', 403],
    ['member', 'viewer', 'MEMBER', 403],
    ['member', 'member', 'ADMIN', 403],
    ['viewer', 'viewer', 'MEMBER', 403],
  ] as const)('let the %s change the %s to %s: %i', async (actor, target, role, status) => {
    const c = await crew();
    const res = await changeRole(c, c[actor], target, role);
    expect(res.status).toBe(status);
    const after = await call(t.url, 'GET', membersPath(c.workspaceId), { token: c.owner.token });
    const stored = after.body.find((m: { id: string }) => m.id === c.ids[target]).role;
    if (status === 200) {
      expect(res.body).toMatchObject({ id: c.ids[target], role });
      expect(stored).toBe(role);
    } else {
      expect(stored).not.toBe(role);
    }
  });

  it.each([
    ['owner', 'admin', 204],
    ['owner', 'viewer', 204],
    ['owner', 'owner', 403],
    ['admin', 'member', 204],
    ['admin', 'viewer', 204],
    ['admin', 'admin2', 403],
    ['admin', 'owner', 403],
    ['member', 'viewer', 403],
    ['viewer', 'member', 403],
  ] as const)('let the %s remove the %s: %i', async (actor, target, status) => {
    const c = await crew();
    const res = await remove(c, c[actor], target);
    expect(res.status).toBe(status);
    const read = await call(t.url, 'GET', `/v1/workspaces/${c.workspaceId}`, {
      token: c[target].token,
    });
    expect(read.status).toBe(status === 204 ? 404 : 200);
  });

  it.each(['admin', 'member', 'viewer'] as const)('let the %s leave', async (who) => {
    const c = await crew();
    expect((await remove(c, c[who], who)).status).toBe(204);
    const read = await call(t.url, 'GET', `/v1/workspaces/${c.workspaceId}`, {
      token: c[who].token,
    });
    expect(read.status).toBe(404);
    const [row] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.workspaceId, c.workspaceId), eq(auditLogs.action, 'member.leave')));
    expect(row?.actorUserId).toBe(c[who].userId);
  });

  it('give a new Role at once', async () => {
    const c = await crew();
    const before = await call(t.url, 'PATCH', `/v1/workspaces/${c.workspaceId}`, {
      token: c.viewer.token,
      body: { name: 'By the viewer' },
    });
    expect(before.status).toBe(403);
    await changeRole(c, c.owner, 'viewer', 'ADMIN');
    const after = await call(t.url, 'PATCH', `/v1/workspaces/${c.workspaceId}`, {
      token: c.viewer.token,
      body: { name: 'By the viewer' },
    });
    expect(after.status).toBe(200);
  });

  it('audit role changes and removals with ids and Roles only', async () => {
    const c = await crew();
    await changeRole(c, c.admin, 'member', 'VIEWER');
    await remove(c, c.owner, 'viewer');
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, c.workspaceId))
      .orderBy(desc(auditLogs.createdAt));
    const roleChange = rows.find((r) => r.action === 'member.role_change');
    expect(roleChange).toMatchObject({
      actorUserId: c.admin.userId,
      metadata: { memberUserId: c.member.userId, from: 'MEMBER', to: 'VIEWER' },
    });
    const removal = rows.find((r) => r.action === 'member.remove');
    expect(removal).toMatchObject({
      actorUserId: c.owner.userId,
      metadata: { memberUserId: c.viewer.userId, role: 'VIEWER' },
    });
  });

  it("revoke a removed Member's sharing Consent", async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    const list = await call(t.url, 'GET', membersPath(owner.workspaceId), { token: owner.token });
    const id = list.body.find((m: { userId: string }) => m.userId === member.userId).id;
    await call(t.url, 'DELETE', `${membersPath(owner.workspaceId)}/${id}`, { token: owner.token });
    const [consent] = await db
      .select()
      .from(userConsents)
      .where(eq(userConsents.userId, member.userId));
    expect(consent?.revokedAt).toBeInstanceOf(Date);
  });

  it("answer 404 for a Member of another Workspace or one that doesn't exist", async () => {
    const c = await crew();
    const other = await registerUser(t.url);
    const theirs = await call(t.url, 'GET', membersPath(other.workspaceId), {
      token: other.token,
    });
    const foreignId = theirs.body[0].id;
    for (const id of [foreignId, '01900000-0000-7000-9000-00000000dead', 'nope']) {
      const res = await call(t.url, 'PATCH', `${membersPath(c.workspaceId)}/${id}`, {
        token: c.owner.token,
        body: { role: 'VIEWER' },
      });
      expect(res.status).toBe(404);
      const del = await call(t.url, 'DELETE', `${membersPath(c.workspaceId)}/${id}`, {
        token: c.owner.token,
      });
      expect(del.status).toBe(404);
    }
  });
});
