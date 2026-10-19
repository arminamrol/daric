import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY } from '../../common/time';
import { DEMO_PASSWORD, seedDemo } from '../../db/seed/demo';
import { auditLogs, invitations, subscriptions, transactions } from '../../db/schema';
import {
  browser,
  call,
  registerUser,
  startTestApp,
  testPassword,
  type TestApp,
} from '../../test/app';
import { testDatabase, uniqueEmail } from '../../test/db';
import { addMember, invite, joined, membersPath, type TestUser } from '../../test/sharing';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

/** The tables, in any schema of ours, holding a row whose text contains `needle`. */
async function tablesMentioning(needle: string): Promise<string[]> {
  const { rows } = await pool.query<{ schema: string; table: string }>(
    `SELECT table_schema AS schema, table_name AS table FROM information_schema.tables
     WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')`,
  );
  const found: string[] = [];
  for (const { schema, table } of rows) {
    const hit = await pool.query(
      `SELECT 1 FROM "${schema}"."${table}" t WHERE t::text ILIKE $1 LIMIT 1`,
      [`%${needle}%`],
    );
    if (hit.rowCount) found.push(`${schema}.${table}`);
  }
  return found;
}

const deletion = (t: TestApp, user: { token: string }) =>
  call(t.url, 'GET', '/v1/me/deletion', { token: user.token });

const deleteAccount = (t: TestApp, user: { token: string }, password = testPassword) =>
  call(t.url, 'POST', '/v1/me/deletion', { token: user.token, body: { password } });

describe('Account deletion', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  it('previews the Workspaces that go with the account', async () => {
    const user = await registerUser(t.url);
    const res = await deletion(t, user);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sharedWorkspaces: [],
      deletedWorkspaces: [{ id: user.workspaceId, name: 'Personal' }],
      plusForfeitedUntil: null,
    });
  });

  it('lists the Workspaces the User owns with others, and leaves out ones they only joined', async () => {
    const owner = await registerUser(t.url);
    const other = await registerUser(t.url);
    await addMember(db, owner.workspaceId, other, 'MEMBER');
    await addMember(db, other.workspaceId, owner, 'ADMIN');
    const res = await deletion(t, owner);
    expect(res.body).toEqual({
      sharedWorkspaces: [{ id: owner.workspaceId, name: 'Personal', otherMembers: 1 }],
      deletedWorkspaces: [],
      plusForfeitedUntil: null,
    });
  });

  it('refuses a wrong password with 403 and keeps everything', async () => {
    const user = await registerUser(t.url);
    const res = await deleteAccount(t, user, 'not my password');
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('WRONG_PASSWORD');
    expect((await call(t.url, 'GET', '/v1/me', { token: user.token })).status).toBe(200);
  });

  it('refuses with 409 while the User owns a Workspace others belong to', async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    const res = await deleteAccount(t, owner);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      reason: 'OWNS_SHARED_WORKSPACE',
      sharedWorkspaces: [{ id: owner.workspaceId, name: 'Personal', otherMembers: 1 }],
    });
    const members = await call(t.url, 'GET', membersPath(owner.workspaceId), {
      token: member.token,
    });
    expect(members.status).toBe(200);
  });

  it('deletes once ownership of the shared Workspace has been transferred', async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    const list = await call(t.url, 'GET', membersPath(owner.workspaceId), { token: owner.token });
    const target = list.body.find((m: { userId: string }) => m.userId === member.userId);
    const transfer = await call(
      t.url,
      'POST',
      `${membersPath(owner.workspaceId)}/${target.id}/transfer-ownership`,
      { token: owner.token },
    );
    expect(transfer.status).toBe(204);

    expect((await deleteAccount(t, owner)).status).toBe(204);
    const after = await call(t.url, 'GET', membersPath(owner.workspaceId), {
      token: member.token,
    });
    expect(after.body.map((m: { userId: string; role: string }) => [m.userId, m.role])).toEqual([
      [member.userId, 'OWNER'],
    ]);
  });

  it('leaves no personal data behind: the User, their Workspace and everything in it', async () => {
    const email = uniqueEmail('deleted');
    const seeded = await seedDemo(db, { today: '2026-10-11', email });
    const login = await call(t.url, 'POST', '/v1/auth/login', {
      body: { email, password: DEMO_PASSWORD },
    });
    const user = { token: login.body.accessToken as string };
    const refreshToken = login.body.refreshToken as string;
    // A second Signed-in Device, and a link mailed to them, to be sure those go too.
    await call(t.url, 'POST', '/v1/auth/login', { body: { email, password: DEMO_PASSWORD } });
    await call(t.url, 'POST', '/v1/auth/password/forgot', { body: { email } });

    expect((await deleteAccount(t, user, DEMO_PASSWORD)).status).toBe(204);

    expect(await tablesMentioning(seeded.userId)).toEqual([]);
    expect(await tablesMentioning(seeded.workspaceId)).toEqual([]);
    expect(await tablesMentioning(email)).toEqual([]);

    const again = await call(t.url, 'POST', '/v1/auth/login', {
      body: { email, password: DEMO_PASSWORD },
    });
    expect(again.status).toBe(401);
    const refresh = await call(t.url, 'POST', '/v1/auth/refresh', { body: { refreshToken } });
    expect(refresh.status).toBe(401);
    expect((await call(t.url, 'GET', '/v1/me', { token: user.token })).status).not.toBe(200);
    // The same email may sign up again, from scratch.
    expect((await registerUser(t.url, email)).workspaceId).not.toBe(seeded.workspaceId);
  });

  it("keeps the audit rows and records of Workspaces they only joined, without the User's identity", async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    const base = `/v1/workspaces/${owner.workspaceId}`;
    const account = await call(t.url, 'POST', `${base}/accounts`, {
      token: owner.token,
      body: { name: 'Melli', type: 'BANK', class: 'ASSET', currency: 'IRR', openingBalance: '0' },
    });
    const category = await call(t.url, 'POST', `${base}/categories`, {
      token: owner.token,
      body: { kind: 'EXPENSE', name: 'Food', icon: 'utensils', color: 'orange' },
    });
    const recorded = await call(t.url, 'POST', `${base}/transactions`, {
      token: member.token,
      body: {
        type: 'EXPENSE',
        accountId: account.body.id,
        categoryId: category.body.id,
        amount: '1000',
        occurredOn: '2026-10-11',
      },
    });
    expect(recorded.status).toBe(201);
    // A later Invitation to the same address, still waiting.
    await call(t.url, 'DELETE', `${membersPath(owner.workspaceId)}/${await memberId(member)}`, {
      token: owner.token,
    });
    const pending = await invite(t, owner, owner.workspaceId, {
      email: member.email,
      role: 'VIEWER',
    });
    expect(pending.status).toBe(201);
    await addMember(db, owner.workspaceId, member, 'MEMBER');
    const auditedBefore = await audited(owner.workspaceId, member.userId);
    expect(auditedBefore.length).toBeGreaterThan(0);

    expect((await deleteAccount(t, member)).status).toBe(204);

    expect(await tablesMentioning(member.userId)).toEqual([]);
    expect(await tablesMentioning(member.email)).toEqual([]);

    // Their Transaction stays in the Workspace, by nobody.
    const [kept] = await db
      .select({ createdBy: transactions.createdBy })
      .from(transactions)
      .where(eq(transactions.id, recorded.body.id));
    expect(kept).toEqual({ createdBy: null });

    // Every audit row stays, without who did it or from where.
    const anonymous = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, owner.workspaceId));
    for (const before of auditedBefore) {
      expect(anonymous.find((r) => r.id === before.id)).toMatchObject({
        actorUserId: null,
        ip: null,
        userAgent: null,
      });
    }
    expect(anonymous.filter((r) => r.action === 'user.delete')).toEqual([
      expect.objectContaining({ actorUserId: null, metadata: { role: 'MEMBER' } }),
    ]);

    // The waiting Invitation can no longer be accepted by anyone.
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, pending.body.id));
    expect(invitation).toMatchObject({ email: null, revokedAt: expect.any(Date) });
    expect(anonymous).toContainEqual(
      expect.objectContaining({
        action: 'invitation.revoke',
        actorUserId: null,
        metadata: { invitationId: pending.body.id },
      }),
    );

    // The Owner's own account and data are untouched.
    const members = await call(t.url, 'GET', membersPath(owner.workspaceId), {
      token: owner.token,
    });
    expect(members.body.map((m: { userId: string }) => m.userId)).toEqual([owner.userId]);

    async function memberId(user: TestUser): Promise<string> {
      const list = await call(t.url, 'GET', membersPath(owner.workspaceId), {
        token: owner.token,
      });
      return list.body.find((m: { userId: string }) => m.userId === user.userId).id;
    }
  });

  it('clears the session cookies of the web app', async () => {
    const web = browser(t.url);
    await web.call('GET', '/v1/auth/csrf');
    await web.call('POST', '/v1/auth/register', {
      body: { email: uniqueEmail(), password: testPassword },
    });
    expect(web.cookie('__Host-daric_access')).toBeDefined();
    const res = await web.call('POST', '/v1/me/deletion', { body: { password: testPassword } });
    expect(res.status).toBe(204);
    expect(web.cookie('__Host-daric_access')).toBeUndefined();
    expect((await web.call('GET', '/v1/me')).status).toBe(401);
  });
});

describe('Account deletion with billing enabled', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp({ env: { BILLING_ENABLED: 'true', TRIAL_DAYS: '14' } });
  });
  afterAll(() => t.close());

  it('warns of nothing during the Trial', async () => {
    const user = await registerUser(t.url);
    expect((await deletion(t, user)).body.plusForfeitedUntil).toBeNull();
  });

  it('warns that bought Plus time is forfeited', async () => {
    const user = await registerUser(t.url);
    const until = new Date(Date.now() + 60 * DAY);
    await db
      .update(subscriptions)
      .set({ expiresAt: until })
      .where(eq(subscriptions.userId, user.userId));
    expect((await deletion(t, user)).body.plusForfeitedUntil).toBe(until.toISOString());
    expect((await deleteAccount(t, user)).status).toBe(204);
  });

  it('warns of nothing once the bought time has run out, in the Grace Period too', async () => {
    const user = await registerUser(t.url);
    const past = new Date(Date.now() - DAY);
    await db
      .update(subscriptions)
      .set({ expiresAt: past, trialEndsAt: new Date(past.getTime() - DAY) })
      .where(eq(subscriptions.userId, user.userId));
    expect((await deletion(t, user)).body.plusForfeitedUntil).toBeNull();
  });
});

/** The audit rows of the Workspace that name `userId` as the one who acted. */
function audited(workspaceId: string, userId: string) {
  return db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(and(eq(auditLogs.workspaceId, workspaceId), eq(auditLogs.actorUserId, userId)));
}
