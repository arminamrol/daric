import type { Money } from '@daric/core';
import { DAY } from '../../common/time';
import { graceEnd } from './entitlements';
import type { BillingConfig } from './billing-config';

/** The longest and shortest stretch of Plus one Payment buys. */
export const MIN_PLUS_MONTHS = 1;
export const MAX_PLUS_MONTHS = 12;

/** A month of Plus is 30 days, whatever the calendar. */
export const DAYS_PER_PLUS_MONTH = 30;

/** What `months` of Plus cost, before and after the tiered discount. */
export interface PlusPrice {
  months: number;
  /** The monthly price times the months. */
  fullAmount: Money;
  /** What the User pays: the full amount less the discount, rounded down to a whole minor unit. */
  amount: Money;
  /** The discount as a whole percent, for showing; the amount is worked out exactly. */
  discountPercent: number;
}

/**
 * Prices `months` of Plus from config (ADR-0008): the monthly price times the
 * months, less the largest discount whose tier the months reach. The client
 * never sends a price; this is the only place one is made.
 */
export function plusPrice(billing: BillingConfig, months: number): PlusPrice {
  if (!Number.isInteger(months) || months < MIN_PLUS_MONTHS || months > MAX_PLUS_MONTHS) {
    throw new RangeError(`Plus is sold for ${MIN_PLUS_MONTHS}–${MAX_PLUS_MONTHS} months`);
  }
  const { amount: monthly, currency } = billing.plusMonthlyPrice;
  const full = monthly * BigInt(months);
  const tier = billing.plusDiscounts
    .filter((d) => months >= d.fromMonths)
    .reduce<(typeof billing.plusDiscounts)[number] | undefined>(
      (best, d) => (best === undefined || d.fromMonths > best.fromMonths ? d : best),
      undefined,
    );
  const [off, of] = tier?.off ?? [0, 1];
  return {
    months,
    fullAmount: { amount: full, currency },
    // Bigint division truncates, which rounds the positive price down.
    amount: { amount: (full * BigInt(of - off)) / BigInt(of), currency },
    discountPercent: Math.round((100 * off) / of),
  };
}

/**
 * The new end of a User's Plus time after buying `months` more: counted from
 * the current expiry while Plus (Trial included) or its Grace Period still
 * runs, so no bought day is lost, and from `now` otherwise.
 */
export function extendedExpiry(input: {
  expiresAt: Date | null;
  months: number;
  now: Date;
  graceDays: number;
}): Date {
  const { expiresAt, months, now, graceDays } = input;
  const stillRunning = expiresAt !== null && now < graceEnd(expiresAt, graceDays);
  const from = stillRunning ? expiresAt : now;
  return new Date(from.getTime() + months * DAYS_PER_PLUS_MONTH * DAY);
}
