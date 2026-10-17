import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY } from '../../common/time';
import { auditLogs, refreshTokens, signedInDevices, subscriptions } from '../../db/schema';
import { browser, call, startTestApp, testPassword, type TestApp } from '../../test/app';
import { testDatabase, uniqueEmail } from '../../test/db';
import { hashToken } from './token.service';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

interface Device {
  accessToken: string;
  refreshToken: string;
}

/** Signs a new User up on a phone (the mobile app); their first Signed-in Device. */
async function signUp(t: TestApp) {
  const email = uniqueEmail();
  const res = await call(t.url, 'POST', '/v1/auth/register', {
    body: { email, password: testPassword },
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  const device: Device = { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
  return { email, userId: res.body.user.id as string, device };
}

/** Logs the User in on another phone. */
async function logIn(t: TestApp, email: string, headers: Record<string, string> = {}) {
  const res = await call(t.url, 'POST', '/v1/auth/login', {
    body: { email, password: testPassword },
    headers,
  });
  expect(res.status).toBe(200);
  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken } as Device;
}

/** Refreshes a device's tokens in place, so it counts as just used. */
async function refresh(t: TestApp, device: Device) {
  const res = await call(t.url, 'POST', '/v1/auth/refresh', {
    body: { refreshToken: device.refreshToken },
  });
  if (res.status === 200) {
    device.accessToken = res.body.accessToken;
    device.refreshToken = res.body.refreshToken;
  }
  return res;
}

/** Ends the User's Plus time, leaving them on Free. */
async function putOnFree(userId: string) {
  const past = new Date(Date.now() - DAY);
  await db
    .update(subscriptions)
    .set({ trialEndsAt: past, expiresAt: past })
    .where(eq(subscriptions.userId, userId));
}

const listDevices = (t: TestApp, device: Device) =>
  call(t.url, 'GET', '/v1/me/devices', { token: device.accessToken });

describe('device limit with billing enabled', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp({
      env: { BILLING_ENABLED: 'true', FREE_DEVICE_LIMIT: '1', PLUS_DEVICE_LIMIT: '3' },
    });
  });
  afterAll(() => t.close());

  it('signs a Free User out of their first device when they log in on a second', async () => {
    const { email, userId, device: first } = await signUp(t);
    await putOnFree(userId);
    const second = await logIn(t, email);

    const refused = await refresh(t, first);
    expect(refused.status).toBe(401);
    expect(refused.body.reason).toBe('DEVICE_LIMIT');
    expect((await refresh(t, second)).status).toBe(200);

    const audited = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.actorUserId, userId), eq(auditLogs.action, 'auth.device_limit')));
    expect(audited).toEqual([{ metadata: { deviceIds: [expect.any(String)] } }]);
  });

  it('keeps every device of a Plus User within the limit', async () => {
    const { email, device: first } = await signUp(t);
    const second = await logIn(t, email);
    const third = await logIn(t, email);
    for (const device of [first, second, third]) {
      expect((await refresh(t, device)).status).toBe(200);
    }
  });

  it('signs a Plus User out of the least recently used device past the limit', async () => {
    const { email, device: first } = await signUp(t);
    const second = await logIn(t, email);
    const third = await logIn(t, email);
    // The first is used again, so the second is now the least recently used.
    expect((await refresh(t, first)).status).toBe(200);
    const fourth = await logIn(t, email);

    expect((await refresh(t, second)).body.reason).toBe('DEVICE_LIMIT');
    for (const device of [first, third, fourth]) {
      expect((await refresh(t, device)).status).toBe(200);
    }
  });

  it('never refuses a login, however many devices are signed in', async () => {
    const { email, userId } = await signUp(t);
    await putOnFree(userId);
    const last = await logIn(t, email);
    await logIn(t, email);
    await logIn(t, email);
    expect((await refresh(t, last)).body.reason).toBe('DEVICE_LIMIT');
    const devices = await db
      .select({ endedAt: signedInDevices.endedAt })
      .from(signedInDevices)
      .where(eq(signedInDevices.userId, userId));
    expect(devices.filter((d) => d.endedAt === null)).toHaveLength(1);
  });

  it('does not count devices that logged out or whose tokens expired', async () => {
    const { email, userId, device: first } = await signUp(t);
    const loggedOut = await logIn(t, email);
    await call(t.url, 'POST', '/v1/auth/logout', {
      body: { refreshToken: loggedOut.refreshToken },
    });
    const lapsed = await logIn(t, email);
    await db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokens.tokenHash, hashToken(lapsed.refreshToken)));
    // Plus allows 3: the first and these two fit, as the other two no longer count.
    const second = await logIn(t, email);
    const third = await logIn(t, email);
    for (const device of [first, second, third]) {
      expect((await refresh(t, device)).status).toBe(200);
    }
    await putOnFree(userId);
    const after = await logIn(t, email);
    expect((await listDevices(t, after)).body).toHaveLength(1);
  });

  it('still detects a reused refresh token, without a reason to show', async () => {
    const { email, device } = await signUp(t);
    const stolen = device.refreshToken;
    await refresh(t, device);
    const replay = await call(t.url, 'POST', '/v1/auth/refresh', {
      body: { refreshToken: stolen },
    });
    expect(replay.status).toBe(401);
    expect(replay.body.reason).toBeUndefined();
    const after = await refresh(t, device);
    expect(after.status).toBe(401);
    expect(after.body.reason).toBeUndefined();
    // The ended family no longer counts.
    const other = await logIn(t, email);
    expect((await listDevices(t, other)).body).toHaveLength(1);
  });

  it('refuses a device ended while its refresh was under way, even with a token left unrevoked', async () => {
    // A login past the limit ended the device as a refresh of it issued a new token.
    const { userId, device } = await signUp(t);
    await db
      .update(signedInDevices)
      .set({ endedAt: new Date(), endReason: 'DEVICE_LIMIT' })
      .where(eq(signedInDevices.userId, userId));
    const res = await refresh(t, device);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('DEVICE_LIMIT');
  });

  it('ends every device and its tokens on a password reset', async () => {
    const { email, userId, device } = await signUp(t);
    const other = await logIn(t, email);
    await call(t.url, 'POST', '/v1/auth/password/forgot', { body: { email } });
    const token = t.mail.lastToken(email);
    expect(
      (
        await call(t.url, 'POST', '/v1/auth/password/reset', {
          body: { token, password: 'a new password!' },
        })
      ).status,
    ).toBe(204);
    for (const d of [device, other]) {
      const res = await refresh(t, d);
      expect(res.status).toBe(401);
      expect(res.body.reason).toBeUndefined();
    }
    const rows = await db
      .select({ endReason: signedInDevices.endReason })
      .from(signedInDevices)
      .where(eq(signedInDevices.userId, userId));
    expect(rows.map((r) => r.endReason)).toEqual(['PASSWORD_RESET', 'PASSWORD_RESET']);
  });

  it('gives no reason after a plain logout', async () => {
    const { device } = await signUp(t);
    await call(t.url, 'POST', '/v1/auth/logout', { body: { refreshToken: device.refreshToken } });
    const res = await refresh(t, device);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBeUndefined();
  });

  it('signs a Free browser out and clears its cookies when it next refreshes', async () => {
    const { email, userId } = await signUp(t);
    await putOnFree(userId);
    const web = browser(t.url);
    await web.call('GET', '/v1/auth/csrf');
    expect(
      (await web.call('POST', '/v1/auth/login', { body: { email, password: testPassword } }))
        .status,
    ).toBe(200);
    await logIn(t, email);

    const res = await web.call('POST', '/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('DEVICE_LIMIT');
    expect(web.cookie('__Secure-daric_refresh')).toBeUndefined();
    expect(web.cookie('__Host-daric_access')).toBeUndefined();
  });
});

describe('Signed-in Devices list', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp({ env: { BILLING_ENABLED: 'true', PLUS_DEVICE_LIMIT: '3' } });
  });
  afterAll(() => t.close());

  it('lists live devices most recently used first, named and with the current one marked', async () => {
    const { email, device: phone } = await signUp(t);
    const laptop = await logIn(t, email, { 'user-agent': CHROME_WINDOWS });
    await logIn(t, email, { 'x-daric-device': 'Galaxy Tab S9' });
    await refresh(t, phone);

    const res = await listDevices(t, laptop);
    expect(res.status).toBe(200);
    expect(res.body.map((d: { name: string | null }) => d.name)).toEqual([
      null,
      'Galaxy Tab S9',
      'Chrome · Windows',
    ]);
    expect(res.body.map((d: { current: boolean }) => d.current)).toEqual([false, false, true]);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      name: null,
      signedInAt: expect.any(String),
      lastUsedAt: expect.any(String),
      current: false,
    });
    expect(Date.parse(res.body[0].lastUsedAt)).toBeGreaterThan(Date.parse(res.body[0].signedInAt));
  });

  it('signs another device out; its next refresh says so', async () => {
    const { email, userId, device: phone } = await signUp(t);
    const laptop = await logIn(t, email);
    const phoneId = (await listDevices(t, laptop)).body.find(
      (d: { current: boolean }) => !d.current,
    ).id;

    const res = await call(t.url, 'DELETE', `/v1/me/devices/${phoneId}`, {
      token: laptop.accessToken,
    });
    expect(res.status).toBe(204);
    const refused = await refresh(t, phone);
    expect(refused.status).toBe(401);
    expect(refused.body.reason).toBe('SIGNED_OUT_REMOTELY');
    expect((await listDevices(t, laptop)).body).toHaveLength(1);

    const [audited] = await db
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    expect(audited).toEqual({ action: 'auth.device_sign_out', metadata: { deviceId: phoneId } });

    // Already signed out.
    expect(
      (await call(t.url, 'DELETE', `/v1/me/devices/${phoneId}`, { token: laptop.accessToken }))
        .status,
    ).toBe(404);
  });

  it("cannot touch another User's devices", async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    const [bDevice] = (await listDevices(t, b.device)).body;
    const res = await call(t.url, 'DELETE', `/v1/me/devices/${bDevice.id}`, {
      token: a.device.accessToken,
    });
    expect(res.status).toBe(404);
    expect((await refresh(t, b.device)).status).toBe(200);
    expect(
      (await call(t.url, 'DELETE', '/v1/me/devices/not-a-uuid', { token: a.device.accessToken }))
        .status,
    ).toBe(404);
  });

  it('is only for a signed-in User', async () => {
    expect((await call(t.url, 'GET', '/v1/me/devices')).status).toBe(401);
  });
});

describe('device limit with billing disabled (the default)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp({ env: { FREE_DEVICE_LIMIT: '1' } });
  });
  afterAll(() => t.close());

  it('keeps every device signed in, even on Free', async () => {
    const { email, userId, device: first } = await signUp(t);
    await putOnFree(userId);
    const others = [await logIn(t, email), await logIn(t, email), await logIn(t, email)];
    for (const device of [first, ...others]) {
      expect((await refresh(t, device)).status).toBe(200);
    }
  });
});
