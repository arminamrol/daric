import { IRR } from '@daric/core';
import { describe, expect, it } from 'vitest';
import { DAY } from '../../common/time';
import { loadConfig } from '../../config';
import { billingConfig } from './billing-config';
import { extendedExpiry, plusPrice } from './pricing';

const env = { DATABASE_URL: 'postgres://localhost/daric', JWT_SECRET: 'x'.repeat(32) };
const billing = (monthly = '2000000') =>
  billingConfig(loadConfig({ ...env, PLUS_MONTHLY_PRICE_IRR: monthly }));

describe('plusPrice', () => {
  it.each([
    [1, 2_000_000n, 2_000_000n, 0],
    [2, 4_000_000n, 4_000_000n, 0],
    [3, 6_000_000n, 5_700_000n, 5],
    [5, 10_000_000n, 9_500_000n, 5],
    [6, 12_000_000n, 10_800_000n, 10],
    [11, 22_000_000n, 19_800_000n, 10],
    // A year costs ten months.
    [12, 24_000_000n, 20_000_000n, 17],
  ])('prices %i months at the tiered discount', (months, full, amount, discountPercent) => {
    expect(plusPrice(billing(), months)).toEqual({
      months,
      fullAmount: { amount: full, currency: IRR },
      amount: { amount, currency: IRR },
      discountPercent,
    });
  });

  it('rounds a discounted price down to a whole rial', () => {
    // 1,234,567 × 3 = 3,703,701; less 5% is 3,518,515.95.
    expect(plusPrice(billing('1234567'), 3).amount.amount).toBe(3_518_515n);
  });

  it('reads the monthly price from config', () => {
    expect(plusPrice(billing('100'), 1).amount.amount).toBe(100n);
  });

  it.each([0, 13, 1.5])('refuses %d months', (months) => {
    expect(() => plusPrice(billing(), months)).toThrow(RangeError);
  });
});

describe('extendedExpiry', () => {
  const now = new Date('2026-10-19T08:00:00Z');
  const days = (n: number) => new Date(now.getTime() + n * DAY);
  const grace = 7;

  it('adds 30 days a month from the current expiry while Plus is active', () => {
    expect(extendedExpiry({ expiresAt: days(10), months: 2, now, graceDays: grace })).toEqual(
      days(70),
    );
  });

  it('extends a Trial from its end', () => {
    expect(extendedExpiry({ expiresAt: days(14), months: 1, now, graceDays: grace })).toEqual(
      days(44),
    );
  });

  it('extends from the old expiry during the Grace Period', () => {
    expect(extendedExpiry({ expiresAt: days(-3), months: 1, now, graceDays: grace })).toEqual(
      days(27),
    );
  });

  it('starts from now once the Grace Period is over', () => {
    expect(extendedExpiry({ expiresAt: days(-7), months: 1, now, graceDays: grace })).toEqual(
      days(30),
    );
  });

  it('starts from now for a User who never had Plus', () => {
    expect(extendedExpiry({ expiresAt: null, months: 12, now, graceDays: grace })).toEqual(
      days(360),
    );
  });
});
