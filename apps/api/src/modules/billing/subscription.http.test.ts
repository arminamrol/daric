import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY } from '../../common/time';
import { subscriptions } from '../../db/schema';
import { call, registerUser, startTestApp, testPassword, type TestApp } from '../../test/app';
import { testDatabase, uniqueEmail } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const subscription = (t: TestApp, token: string) =>
  call(t.url, 'GET', '/v1/me/subscription', { token });

/** Milliseconds from now until `iso`. */
const fromNow = (iso: string) => new Date(iso).getTime() - Date.now();

describe('Subscription with billing enabled', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp({
      env: { BILLING_ENABLED: 'true', TRIAL_DAYS: '14', PLUS_DEVICE_LIMIT: '3' },
    });
  });
  afterAll(() => t.close());

  it('starts a 14-day Plus Trial at sign-up', async () => {
    const a = await registerUser(t.url);
    const res = await subscription(t, a.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      billingEnabled: true,
      plan: 'PLUS',
      onTrial: true,
      entitlements: { signedInDevices: 3, shareWorkspace: true },
    });
    expect(res.body.expiresAt).toBe(res.body.trialEndsAt);
    expect(Math.abs(fromNow(res.body.expiresAt) - 14 * DAY)).toBeLessThan(60_000);
  });

  it('puts a User whose Plus time ended on Free', async () => {
    const a = await registerUser(t.url);
    const past = new Date(Date.now() - DAY);
    await db
      .update(subscriptions)
      .set({ trialEndsAt: past, expiresAt: past })
      .where(eq(subscriptions.userId, a.userId));
    const res = await subscription(t, a.token);
    expect(res.body).toMatchObject({
      plan: 'FREE',
      onTrial: false,
      expiresAt: past.toISOString(),
      entitlements: { signedInDevices: 1, shareWorkspace: false, aiAnalysesPerMonth: 1 },
    });
  });

  it('gives a User one Trial, however often their email signs up', async () => {
    const email = uniqueEmail();
    const a = await registerUser(t.url, email);
    const again = await call(t.url, 'POST', '/v1/auth/register', {
      body: { email, password: testPassword },
    });
    expect(again.status).toBe(409);
    const rows = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.userId, a.userId));
    expect(rows).toHaveLength(1);
  });

  it('is only for a signed-in User', async () => {
    expect((await call(t.url, 'GET', '/v1/me/subscription')).status).toBe(401);
  });
});

describe('Subscription with billing disabled (the default)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  it('still starts the Trial, but every Entitlement is unlimited', async () => {
    const a = await registerUser(t.url);
    const res = await subscription(t, a.token);
    expect(res.body).toMatchObject({
      billingEnabled: false,
      plan: 'PLUS',
      onTrial: true,
      entitlements: {
        signedInDevices: null,
        shareWorkspace: true,
        aiAnalysesPerMonth: null,
        aiAnalysesLeftThisMonth: null,
      },
    });
  });
});
