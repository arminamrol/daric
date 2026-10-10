import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, authIdentities } from '../../db/schema';
import { call, registerUser, startTestApp, testPassword, type TestApp } from '../../test/app';
import { testDatabase, uniqueEmail } from '../../test/db';

let t: TestApp;
const { db, pool } = testDatabase();
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.close();
  await pool.end();
});

// There is no audit-log API yet (it arrives with the audit module), so these read the table.
function auditFor(userId: string) {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.actorUserId, userId))
    .orderBy(desc(auditLogs.createdAt));
}

// `call` acts as the mobile app; web sign-up with cookies is in web-session.http.test.ts.
describe('POST /v1/auth/register', () => {
  it('creates the User with a Personal Workspace they own and logs them in', async () => {
    const email = uniqueEmail();
    const res = await call(t.url, 'POST', '/v1/auth/register', {
      body: { email, password: testPassword },
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({ id: expect.any(String), email });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    // The mobile app keeps the tokens itself; cookies are only for the web app.
    expect(res.headers.getSetCookie()).toEqual([]);

    const me = await call(t.url, 'GET', '/v1/me', { token: res.body.accessToken });
    expect(me.status).toBe(200);
    expect(me.body.workspaces).toEqual([
      expect.objectContaining({ type: 'PERSONAL', role: 'OWNER', calendar: 'jalali' }),
    ]);
  });
});

describe('POST /v1/auth/register rejections', () => {
  it('rejects an email that is already registered, ignoring case', async () => {
    const email = uniqueEmail();
    await registerUser(t.url, email);
    const res = await call(t.url, 'POST', '/v1/auth/register', {
      body: { email: `  ${email.toUpperCase()} `, password: testPassword },
    });
    expect(res.status).toBe(409);
  });

  it.each([
    ['a malformed email', { email: 'not-an-email', password: testPassword }],
    ['a short password', { email: uniqueEmail(), password: 'short' }],
    ['a missing password', { email: uniqueEmail() }],
  ])('rejects %s with 400', async (_, body) => {
    const res = await call(t.url, 'POST', '/v1/auth/register', { body });
    expect(res.status).toBe(400);
  });

  it('stores the password as an argon2id hash', async () => {
    const { userId } = await registerUser(t.url);
    const [identity] = await db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.userId, userId));
    expect(identity?.secretHash).toMatch(/^\$argon2id\$/);
    expect(identity?.secretHash).not.toContain(testPassword);
  });

  it('writes the registration to the audit log', async () => {
    const { userId, workspaceId } = await registerUser(t.url);
    const [entry] = await auditFor(userId);
    expect(entry).toMatchObject({ action: 'auth.register', workspaceId });
  });
});

describe('POST /v1/auth/login', () => {
  it('logs in with the registered email and password', async () => {
    const { email, userId } = await registerUser(t.url);
    const res = await call(t.url, 'POST', '/v1/auth/login', {
      body: { email: email.toUpperCase(), password: testPassword },
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: userId, email });

    const me = await call(t.url, 'GET', '/v1/me', { token: res.body.accessToken });
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(userId);
  });

  it('answers a wrong password and an unknown email the same way', async () => {
    const { email } = await registerUser(t.url);
    const wrong = await call(t.url, 'POST', '/v1/auth/login', {
      body: { email, password: 'wrong password!' },
    });
    const unknown = await call(t.url, 'POST', '/v1/auth/login', {
      body: { email: uniqueEmail(), password: testPassword },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('writes logins and failed logins to the audit log', async () => {
    const { email, userId } = await registerUser(t.url);
    await call(t.url, 'POST', '/v1/auth/login', { body: { email, password: 'wrong password!' } });
    await call(t.url, 'POST', '/v1/auth/login', {
      body: { email, password: testPassword },
      headers: { 'user-agent': 'daric-test' },
    });

    const actions = (await auditFor(userId)).map((e) => e.action);
    expect(actions).toEqual(['auth.login', 'auth.login_failed', 'auth.register']);
    const [login] = await auditFor(userId);
    expect(login).toMatchObject({
      workspaceId: null,
      userAgent: 'daric-test',
      ip: expect.any(String),
    });
  });
});

describe('access tokens', () => {
  it.each([
    ['no token', undefined],
    ['a malformed token', 'not-a-jwt'],
    [
      'a token signed with another key',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMTkwMDAwMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDAwMDAiLCJpc3MiOiJkYXJpYyJ9.c2lnbmF0dXJl',
    ],
  ])('rejects %s with 401', async (_, token) => {
    const res = await call(t.url, 'GET', '/v1/me', token ? { token } : {});
    expect(res.status).toBe(401);
  });
});
