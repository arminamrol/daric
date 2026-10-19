import { describe, expect, it } from 'vitest';
import { DAY } from '../../common/time';
import { loadConfig } from '../../config';
import { billingConfig } from './billing-config';
import { subscriptionView, trialFor } from './entitlements';

const now = new Date('2026-10-14T08:00:00Z');
const daysFromNow = (n: number) => new Date(now.getTime() + n * DAY);

const env = { DATABASE_URL: 'postgres://localhost/daric', JWT_SECRET: 'x'.repeat(32) };
const billing = billingConfig(
  loadConfig({
    ...env,
    BILLING_ENABLED: 'true',
    FREE_DEVICE_LIMIT: '1',
    PLUS_DEVICE_LIMIT: '3',
    FREE_AI_ANALYSES_PER_MONTH: '1',
    PLUS_AI_ANALYSES_PER_MONTH: '30',
  }),
);
const view = (
  subscription: Parameters<typeof subscriptionView>[0],
  options: { aiAnalysesUsedThisMonth?: number; billing?: typeof billing } = {},
) =>
  subscriptionView(subscription, {
    now,
    billing: options.billing ?? billing,
    aiAnalysesUsedThisMonth: options.aiAnalysesUsedThisMonth ?? 0,
  });

describe('trialFor', () => {
  it('gives that many days of Plus from now', () => {
    expect(trialFor(now, 14)).toEqual({
      plan: 'PLUS',
      trialEndsAt: daysFromNow(14),
      expiresAt: daysFromNow(14),
    });
  });
});

describe('subscriptionView', () => {
  it('gives a User on the Trial the Plus Entitlements', () => {
    expect(
      view({ plan: 'PLUS', trialEndsAt: daysFromNow(14), expiresAt: daysFromNow(14) }),
    ).toEqual({
      billingEnabled: true,
      plan: 'PLUS',
      onTrial: true,
      trialEndsAt: daysFromNow(14).toISOString(),
      expiresAt: daysFromNow(14).toISOString(),
      graceEndsAt: daysFromNow(21).toISOString(),
      inGracePeriod: false,
      entitlements: {
        signedInDevices: 3,
        shareWorkspace: true,
        aiAnalysesPerMonth: 30,
        aiAnalysesLeftThisMonth: 30,
      },
    });
  });

  it('gives a User who bought Plus the Plus Entitlements, no longer on the Trial', () => {
    const result = view({
      plan: 'PLUS',
      trialEndsAt: daysFromNow(-20),
      expiresAt: daysFromNow(40),
    });
    expect(result).toMatchObject({ plan: 'PLUS', onTrial: false });
    expect(result.entitlements).toMatchObject({ signedInDevices: 3, shareWorkspace: true });
  });

  it('counts Plus bought during the Trial as bought, not Trial', () => {
    expect(
      view({ plan: 'PLUS', trialEndsAt: daysFromNow(5), expiresAt: daysFromNow(35) }),
    ).toMatchObject({ plan: 'PLUS', onTrial: false });
  });

  it('keeps Plus Entitlements through the Grace Period after Plus time ends', () => {
    expect(
      view({ plan: 'PLUS', trialEndsAt: daysFromNow(-3), expiresAt: daysFromNow(-3) }),
    ).toEqual({
      billingEnabled: true,
      plan: 'PLUS',
      onTrial: false,
      trialEndsAt: daysFromNow(-3).toISOString(),
      expiresAt: daysFromNow(-3).toISOString(),
      graceEndsAt: daysFromNow(4).toISOString(),
      inGracePeriod: true,
      entitlements: {
        signedInDevices: 3,
        shareWorkspace: true,
        aiAnalysesPerMonth: 30,
        aiAnalysesLeftThisMonth: 30,
      },
    });
  });

  it('starts the Grace Period at the expiry instant itself', () => {
    expect(view({ plan: 'PLUS', trialEndsAt: null, expiresAt: now })).toMatchObject({
      plan: 'PLUS',
      inGracePeriod: true,
    });
  });

  it('is not in the Grace Period while Plus time runs', () => {
    expect(view({ plan: 'PLUS', trialEndsAt: null, expiresAt: daysFromNow(1) })).toMatchObject({
      plan: 'PLUS',
      inGracePeriod: false,
      graceEndsAt: daysFromNow(8).toISOString(),
    });
  });

  it('puts a User on Free once the Grace Period has ended, keeping the dates', () => {
    expect(
      view({ plan: 'PLUS', trialEndsAt: daysFromNow(-7), expiresAt: daysFromNow(-7) }),
    ).toEqual({
      billingEnabled: true,
      plan: 'FREE',
      onTrial: false,
      trialEndsAt: daysFromNow(-7).toISOString(),
      expiresAt: daysFromNow(-7).toISOString(),
      graceEndsAt: now.toISOString(),
      inGracePeriod: false,
      entitlements: {
        signedInDevices: 1,
        shareWorkspace: false,
        aiAnalysesPerMonth: 1,
        aiAnalysesLeftThisMonth: 1,
      },
    });
  });

  it('takes the Grace Period from config', () => {
    const short = { ...billing, graceDays: 2 };
    const ended = { plan: 'PLUS', trialEndsAt: null, expiresAt: daysFromNow(-3) } as const;
    expect(view(ended, { billing: short }).plan).toBe('FREE');
    expect(view(ended).plan).toBe('PLUS');
  });

  it('puts a User with no Subscription on Free', () => {
    expect(view(undefined)).toMatchObject({
      plan: 'FREE',
      onTrial: false,
      trialEndsAt: null,
      expiresAt: null,
      graceEndsAt: null,
      inGracePeriod: false,
      entitlements: { signedInDevices: 1, shareWorkspace: false },
    });
  });

  it('subtracts the AI analyses used this month, never below zero', () => {
    const plus = { plan: 'PLUS', trialEndsAt: null, expiresAt: daysFromNow(10) } as const;
    expect(view(plus, { aiAnalysesUsedThisMonth: 4 }).entitlements.aiAnalysesLeftThisMonth).toBe(
      26,
    );
    expect(
      view(undefined, { aiAnalysesUsedThisMonth: 3 }).entitlements.aiAnalysesLeftThisMonth,
    ).toBe(0);
  });

  it('makes every Entitlement unlimited when billing is disabled, whatever the Plan', () => {
    const disabled = { ...billing, enabled: false };
    const unlimited = {
      signedInDevices: null,
      shareWorkspace: true,
      aiAnalysesPerMonth: null,
      aiAnalysesLeftThisMonth: null,
    };
    const expired = {
      plan: 'PLUS',
      trialEndsAt: daysFromNow(-10),
      expiresAt: daysFromNow(-10),
    } as const;
    expect(view(expired, { billing: disabled, aiAnalysesUsedThisMonth: 99 })).toMatchObject({
      billingEnabled: false,
      plan: 'FREE',
      entitlements: unlimited,
    });
    expect(view(undefined, { billing: disabled }).entitlements).toEqual(unlimited);
  });

  it('reads the limits from config', () => {
    const custom = billingConfig(
      loadConfig({ ...env, BILLING_ENABLED: 'true', FREE_DEVICE_LIMIT: '2' }),
    );
    expect(view(undefined, { billing: custom }).entitlements.signedInDevices).toBe(2);
  });

  it('leaves billing disabled by default', () => {
    expect(billingConfig(loadConfig(env)).enabled).toBe(false);
  });
});
