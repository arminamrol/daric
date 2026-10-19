import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY } from '../../common/time';
import { subscriptions } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';
import { PaymentsNotConfiguredError } from './payment-provider';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const APP_URL = 'http://localhost:5173';

type User = Awaited<ReturnType<typeof registerUser>>;

const checkout = (t: TestApp, user: User, body: unknown) =>
  call(t.url, 'POST', '/v1/me/payments', { token: user.token, body });
const subscription = async (t: TestApp, user: User) =>
  (await call(t.url, 'GET', '/v1/me/subscription', { token: user.token })).body;
const history = async (t: TestApp, user: User) =>
  (await call(t.url, 'GET', '/v1/me/payments', { token: user.token })).body;

/** The provider sends the payer's browser back; the API answers with a redirect to the web app. */
async function callback(t: TestApp, reference: string, status: 'OK' | 'NOK') {
  const res = await fetch(
    `${t.url}/v1/payments/callback?reference=${encodeURIComponent(reference)}&status=${status}`,
    { redirect: 'manual' },
  );
  return { status: res.status, location: res.headers.get('location') };
}

/** Starts buying `months` and returns the Payment and its provider reference. */
async function startCheckout(t: TestApp, user: User, months: number) {
  const res = await checkout(t, user, { months });
  expect(res.status).toBe(201);
  return { payment: res.body.payment, reference: t.payments.lastReference() };
}

async function setExpiry(user: User, expiresAt: Date) {
  await db.update(subscriptions).set({ expiresAt }).where(eq(subscriptions.userId, user.userId));
}

const ms = (iso: string) => new Date(iso).getTime();

describe('Buying Plus with billing enabled', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp({
      env: { BILLING_ENABLED: 'true', TRIAL_DAYS: '14', PLUS_MONTHLY_PRICE_IRR: '2000000' },
    });
  });
  afterAll(() => t.close());

  it('prices 1 to 12 months on the server, with the tiered discount', async () => {
    const a = await registerUser(t.url);
    const res = await call(t.url, 'GET', '/v1/me/subscription/prices', { token: a.token });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(12);
    expect(res.body[0]).toEqual({
      months: 1,
      fullAmount: '2000000',
      amount: '2000000',
      currency: 'IRR',
      discountPercent: 0,
    });
    expect(res.body[11]).toEqual({
      months: 12,
      fullAmount: '24000000',
      amount: '20000000',
      currency: 'IRR',
      discountPercent: 17,
    });
  });

  it('extends the Subscription after the provider confirms the Payment', async () => {
    const a = await registerUser(t.url);
    const before = await subscription(t, a);

    // A price from the client is ignored.
    const res = await checkout(t, a, { months: 3, amount: '1' });
    expect(res.status).toBe(201);
    const reference = t.payments.lastReference();
    expect(res.body.redirectUrl).toBe(`https://pay.example/start/${reference}`);
    expect(res.body.payment).toMatchObject({
      months: 3,
      amount: '5700000',
      currency: 'IRR',
      status: 'PENDING',
      receipt: null,
      plusUntil: null,
      completedAt: null,
    });
    expect(t.payments.requests.at(-1)).toMatchObject({
      amount: { amount: 5_700_000n },
      callbackUrl: `${APP_URL}/v1/payments/callback`,
    });

    t.payments.pay(reference);
    const back = await callback(t, reference, 'OK');
    expect(back.status).toBe(302);
    expect(back.location).toBe(`${APP_URL}/settings/subscription?payment=${res.body.payment.id}`);

    // Bought during the Trial: counted from the Trial's end.
    const after = await subscription(t, a);
    expect(ms(after.expiresAt) - ms(before.expiresAt)).toBe(90 * DAY);
    expect(after).toMatchObject({ plan: 'PLUS', onTrial: false });

    const paid = await call(t.url, 'GET', `/v1/me/payments/${res.body.payment.id}`, {
      token: a.token,
    });
    expect(paid.body).toMatchObject({
      status: 'PAID',
      receipt: `R-${reference}`,
      plusUntil: after.expiresAt,
    });
    expect(paid.body.completedAt).not.toBeNull();
    expect(await history(t, a)).toEqual([paid.body]);
  });

  it('marks a Payment the provider does not confirm as Failed, extending nothing', async () => {
    const a = await registerUser(t.url);
    const before = await subscription(t, a);
    const { payment, reference } = await startCheckout(t, a, 1);

    // The browser says OK, but the provider never got the money.
    expect((await callback(t, reference, 'OK')).status).toBe(302);

    expect((await subscription(t, a)).expiresAt).toBe(before.expiresAt);
    expect(await history(t, a)).toMatchObject([
      { id: payment.id, status: 'FAILED', receipt: null, plusUntil: null },
    ]);
  });

  it('marks a Payment the User turned back from as Canceled', async () => {
    const a = await registerUser(t.url);
    const before = await subscription(t, a);
    const { payment, reference } = await startCheckout(t, a, 6);

    const back = await callback(t, reference, 'NOK');
    expect(back.location).toBe(`${APP_URL}/settings/subscription?payment=${payment.id}`);

    expect((await subscription(t, a)).expiresAt).toBe(before.expiresAt);
    expect(await history(t, a)).toMatchObject([{ id: payment.id, status: 'CANCELED' }]);
  });

  it('extends once however often the callback comes, even at the same time', async () => {
    const a = await registerUser(t.url);
    const before = await subscription(t, a);
    const { reference } = await startCheckout(t, a, 1);
    t.payments.pay(reference);
    const verifiedBefore = t.payments.verifications;

    await Promise.all([callback(t, reference, 'OK'), callback(t, reference, 'OK')]);
    await callback(t, reference, 'OK');

    const after = await subscription(t, a);
    expect(ms(after.expiresAt) - ms(before.expiresAt)).toBe(30 * DAY);
    expect(t.payments.verifications - verifiedBefore).toBe(1);
    expect(await history(t, a)).toHaveLength(1);
  });

  it('extends from now once Plus and its Grace Period have ended', async () => {
    const a = await registerUser(t.url);
    await setExpiry(a, new Date(Date.now() - 8 * DAY));
    const { reference } = await startCheckout(t, a, 1);
    t.payments.pay(reference);

    const start = Date.now();
    await callback(t, reference, 'OK');

    const after = await subscription(t, a);
    expect(after).toMatchObject({ plan: 'PLUS', onTrial: false });
    expect(ms(after.expiresAt)).toBeGreaterThanOrEqual(start + 30 * DAY);
    expect(ms(after.expiresAt)).toBeLessThanOrEqual(Date.now() + 30 * DAY);
  });

  it('extends from the old expiry during the Grace Period', async () => {
    const a = await registerUser(t.url);
    const ended = new Date(Date.now() - 3 * DAY);
    await setExpiry(a, ended);
    const { reference } = await startCheckout(t, a, 2);
    t.payments.pay(reference);

    await callback(t, reference, 'OK');

    expect(ms((await subscription(t, a)).expiresAt)).toBe(ended.getTime() + 60 * DAY);
  });

  it('keeps a Payment Pending when the provider cannot be asked, and verifies it next time', async () => {
    const a = await registerUser(t.url);
    const before = await subscription(t, a);
    const { payment, reference } = await startCheckout(t, a, 1);
    t.payments.pay(reference);

    t.payments.failVerify = true;
    try {
      expect((await callback(t, reference, 'OK')).status).toBe(302);
    } finally {
      t.payments.failVerify = false;
    }
    const pending = await call(t.url, 'GET', `/v1/me/payments/${payment.id}`, { token: a.token });
    expect(pending.body.status).toBe('PENDING');
    expect(await history(t, a)).toEqual([]);

    await callback(t, reference, 'OK');
    const after = await subscription(t, a);
    expect(ms(after.expiresAt) - ms(before.expiresAt)).toBe(30 * DAY);
  });

  it('sends a callback that matches no Payment to the Subscription page', async () => {
    expect(await callback(t, 'nobody-knows-this', 'OK')).toEqual({
      status: 302,
      location: `${APP_URL}/settings/subscription`,
    });
    const res = await fetch(`${t.url}/v1/payments/callback?foo=bar`, { redirect: 'manual' });
    expect(res.headers.get('location')).toBe(`${APP_URL}/settings/subscription`);
  });

  it('answers 502 and records a Failed Payment when the provider will not start one', async () => {
    const a = await registerUser(t.url);
    t.payments.failRequests = true;
    try {
      expect((await checkout(t, a, { months: 1 })).status).toBe(502);
    } finally {
      t.payments.failRequests = false;
    }
    expect(await history(t, a)).toMatchObject([{ status: 'FAILED' }]);
  });

  it('answers 503 when no payment provider is configured', async () => {
    const a = await registerUser(t.url);
    t.payments.failRequests = new PaymentsNotConfiguredError();
    try {
      expect((await checkout(t, a, { months: 1 })).status).toBe(503);
    } finally {
      t.payments.failRequests = false;
    }
  });

  it('sells only 1 to 12 whole months', async () => {
    const a = await registerUser(t.url);
    for (const months of [0, 13, 1.5, '3']) {
      expect((await checkout(t, a, { months })).status).toBe(400);
    }
    expect((await checkout(t, a, {})).status).toBe(400);
  });

  it("never shows one User another's Payment", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);
    const { payment } = await startCheckout(t, a, 1);
    const res = await call(t.url, 'GET', `/v1/me/payments/${payment.id}`, { token: b.token });
    expect(res.status).toBe(404);
    expect(
      (await call(t.url, 'GET', '/v1/me/payments/not-a-uuid', { token: b.token })).status,
    ).toBe(404);
  });

  it('is only for a signed-in User', async () => {
    expect((await call(t.url, 'GET', '/v1/me/subscription/prices')).status).toBe(401);
    expect((await call(t.url, 'POST', '/v1/me/payments', { body: { months: 1 } })).status).toBe(
      401,
    );
    expect((await call(t.url, 'GET', '/v1/me/payments')).status).toBe(401);
  });
});

describe('Buying Plus with billing disabled (the default)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  it('sells nothing', async () => {
    const a = await registerUser(t.url);
    expect(
      (await call(t.url, 'GET', '/v1/me/subscription/prices', { token: a.token })).status,
    ).toBe(404);
    expect((await checkout(t, a, { months: 1 })).status).toBe(404);
    expect(t.payments.requests).toEqual([]);
  });
});
