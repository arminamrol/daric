import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, refreshTokens } from '../../db/schema';
import {
  browser,
  call,
  startTestApp,
  testPassword,
  type Browser,
  type TestApp,
} from '../../test/app';
import { testDatabase, uniqueEmail } from '../../test/db';
import { hashRefreshToken } from './token.service';

let t: TestApp;
const { db, pool } = testDatabase();
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.close();
  await pool.end();
});

/** A mobile sign-up: the tokens come back in the body. */
async function mobileSession() {
  const email = uniqueEmail();
  const res = await call(t.url, 'POST', '/v1/auth/register', {
    body: { email, password: testPassword },
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  return {
    email,
    userId: res.body.user.id as string,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

function refresh(refreshToken: string) {
  return call(t.url, 'POST', '/v1/auth/refresh', { body: { refreshToken } });
}

function logout(refreshToken: string) {
  return call(t.url, 'POST', '/v1/auth/logout', { body: { refreshToken } });
}

function auditActions(userId: string) {
  return db
    .select({ action: auditLogs.action })
    .from(auditLogs)
    .where(eq(auditLogs.actorUserId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .then((rows) => rows.map((r) => r.action));
}

describe('mobile refresh', () => {
  it('rotates the refresh token and hands out a working access token', async () => {
    const s = await mobileSession();
    const res = await refresh(s.refreshToken);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: s.userId, email: s.email },
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      accessTokenExpiresAt: expect.any(String),
      refreshTokenExpiresAt: expect.any(String),
    });
    expect(res.body.refreshToken).not.toBe(s.refreshToken);
    expect(res.headers.getSetCookie()).toEqual([]);

    const me = await call(t.url, 'GET', '/v1/me', { token: res.body.accessToken });
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(s.userId);
  });

  it('keeps rotating within the same family', async () => {
    const s = await mobileSession();
    const first = await refresh(s.refreshToken);
    const second = await refresh(first.body.refreshToken);
    expect(second.status).toBe(200);
    const third = await refresh(second.body.refreshToken);
    expect(third.status).toBe(200);
  });

  it('gives a 15-minute access token and a 30-day refresh token by default', async () => {
    const s = await mobileSession();
    const before = Date.now();
    const res = await refresh(s.refreshToken);
    const access = Date.parse(res.body.accessTokenExpiresAt) - before;
    const refreshTtl = Date.parse(res.body.refreshTokenExpiresAt) - before;
    expect(access).toBeGreaterThan(15 * 60 * 1000 - 5000);
    expect(access).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
    expect(refreshTtl).toBeGreaterThan(30 * 86400 * 1000 - 5000);
    expect(refreshTtl).toBeLessThanOrEqual(30 * 86400 * 1000 + 1000);
  });

  it('rejects a rotated token', async () => {
    const s = await mobileSession();
    await refresh(s.refreshToken);
    expect((await refresh(s.refreshToken)).status).toBe(401);
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    const s = await mobileSession();
    const rotated = await refresh(s.refreshToken);

    // An attacker replays the stolen, already-used token…
    expect((await refresh(s.refreshToken)).status).toBe(401);
    // …so the legitimate holder's newer token is dead too.
    expect((await refresh(rotated.body.refreshToken)).status).toBe(401);

    const family = await db
      .select({ revokedAt: refreshTokens.revokedAt })
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, s.userId));
    expect(family.length).toBe(2);
    expect(family.every((row) => row.revokedAt !== null)).toBe(true);
    expect(await auditActions(s.userId)).toContain('auth.refresh_reuse');
  });

  it('leaves other Signed-in Devices alone when one family is revoked', async () => {
    const s = await mobileSession();
    const other = await call(t.url, 'POST', '/v1/auth/login', {
      body: { email: s.email, password: testPassword },
    });
    await refresh(s.refreshToken);
    await refresh(s.refreshToken); // reuse: revokes the first family only
    expect((await refresh(other.body.refreshToken)).status).toBe(200);
  });

  it('rejects an expired refresh token', async () => {
    const s = await mobileSession();
    await db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(s.refreshToken)));
    expect((await refresh(s.refreshToken)).status).toBe(401);
  });

  it.each([
    ['an unknown token', { refreshToken: 'not-a-real-token' }],
    ['an empty token', { refreshToken: '' }],
    ['no token', {}],
  ])('rejects %s', async (_, body) => {
    const res = await call(t.url, 'POST', '/v1/auth/refresh', { body });
    expect(res.status).toBe(401);
  });

  it('does not take the refresh token from a cookie', async () => {
    const s = await mobileSession();
    const res = await call(t.url, 'POST', '/v1/auth/refresh', {
      headers: { cookie: `__Secure-daric_refresh=${s.refreshToken}` },
      body: {},
    });
    expect(res.status).toBe(401);
  });
});

describe('mobile logout', () => {
  it('revokes the family so its refresh token no longer works', async () => {
    const s = await mobileSession();
    const rotated = await refresh(s.refreshToken);

    const res = await logout(rotated.body.refreshToken);
    expect(res.status).toBe(204);
    expect((await refresh(rotated.body.refreshToken)).status).toBe(401);
    expect(await auditActions(s.userId)).toContain('auth.logout');
  });

  it('succeeds for a token that is already gone', async () => {
    expect((await logout('not-a-real-token')).status).toBe(204);
  });
});

/** A browser signed up through the web flow. */
async function webSession(): Promise<{ web: Browser; email: string }> {
  const web = browser(t.url);
  await web.call('GET', '/v1/auth/csrf');
  const email = uniqueEmail();
  const res = await web.call('POST', '/v1/auth/register', {
    body: { email, password: testPassword },
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  return { web, email };
}

describe('web refresh', () => {
  it('rotates both cookies and keeps tokens out of the body', async () => {
    const { web, email } = await webSession();
    const oldAccess = web.cookie('__Host-daric_access');
    const oldRefresh = web.cookie('__Secure-daric_refresh');

    const res = await web.call('POST', '/v1/auth/refresh');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'accessTokenExpiresAt',
      'refreshTokenExpiresAt',
      'user',
    ]);
    expect(res.body.user.email).toBe(email);
    expect(web.cookie('__Secure-daric_refresh')).not.toBe(oldRefresh);
    expect(web.cookie('__Host-daric_access')).not.toBe(oldAccess);
    expect((await web.call('GET', '/v1/me')).status).toBe(200);
  });

  it('needs the CSRF token', async () => {
    const { web } = await webSession();
    expect((await web.call('POST', '/v1/auth/refresh', { csrf: false })).status).toBe(403);
  });

  it('ignores a refresh token in the body', async () => {
    const s = await mobileSession();
    const web = browser(t.url);
    await web.call('GET', '/v1/auth/csrf');
    const res = await web.call('POST', '/v1/auth/refresh', {
      body: { refreshToken: s.refreshToken },
    });
    expect(res.status).toBe(401);
  });

  it('is rejected without a refresh cookie', async () => {
    const web = browser(t.url);
    await web.call('GET', '/v1/auth/csrf');
    expect((await web.call('POST', '/v1/auth/refresh')).status).toBe(401);
  });
});

describe('web logout', () => {
  it('revokes the family and clears the session cookies', async () => {
    const { web } = await webSession();
    const refreshToken = web.cookie('__Secure-daric_refresh') ?? '';

    const res = await web.call('POST', '/v1/auth/logout');
    expect(res.status).toBe(204);
    expect(web.cookie('__Host-daric_access')).toBeUndefined();
    expect(web.cookie('__Secure-daric_refresh')).toBeUndefined();
    expect((await web.call('GET', '/v1/me')).status).toBe(401);

    const [row] = await db
      .select({ revokedAt: refreshTokens.revokedAt })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)));
    expect(row?.revokedAt).not.toBeNull();
  });

  it('needs the CSRF token', async () => {
    const { web } = await webSession();
    expect((await web.call('POST', '/v1/auth/logout', { csrf: false })).status).toBe(403);
    expect((await web.call('POST', '/v1/auth/refresh')).status).toBe(200);
  });

  it('clears cookies even with no session', async () => {
    const web = browser(t.url);
    await web.call('GET', '/v1/auth/csrf');
    expect((await web.call('POST', '/v1/auth/logout')).status).toBe(204);
  });
});

describe('token lifetimes', () => {
  it('follows ACCESS_TOKEN_TTL_SECONDS and REFRESH_TOKEN_TTL_SECONDS', async () => {
    const custom = await startTestApp({
      env: { ACCESS_TOKEN_TTL_SECONDS: '60', REFRESH_TOKEN_TTL_SECONDS: '3600' },
    });
    try {
      const before = Date.now();
      const res = await call(custom.url, 'POST', '/v1/auth/register', {
        body: { email: uniqueEmail(), password: testPassword },
      });
      const access = Date.parse(res.body.accessTokenExpiresAt) - before;
      const refreshTtl = Date.parse(res.body.refreshTokenExpiresAt) - before;
      expect(access).toBeGreaterThan(55_000);
      expect(access).toBeLessThanOrEqual(61_000);
      expect(refreshTtl).toBeGreaterThan(3_595_000);
      expect(refreshTtl).toBeLessThanOrEqual(3_601_000);
    } finally {
      await custom.close();
    }
  });
});
