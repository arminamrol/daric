import { IRR, type Entitlements, type Money, type Plan } from '@daric/core';
import type { Config } from '../../config';

/** One Plan's limits; `null` is unlimited. */
export type PlanLimits = Omit<Entitlements, 'aiAnalysesLeftThisMonth'>;

/** Plans, their limits and prices, as the Entitlement service reads them. */
export interface BillingConfig {
  enabled: boolean;
  trialDays: number;
  limits: Record<Plan, PlanLimits>;
  plusMonthlyPrice: Money;
  /** Discounts by how many months are bought; the largest tier reached applies. */
  plusDiscounts: readonly PlusDiscount[];
  /** Days after Plus ends during which it still counts as running (ADR-0008). */
  graceDays: number;
}

/** `off` is a fraction, `[numerator, denominator]`, so a year can cost exactly ten months. */
export interface PlusDiscount {
  fromMonths: number;
  off: readonly [number, number];
}

/** 3+ months 5% off, 6+ 10% off, and a year for the price of ten months (~17%). */
export const PLUS_DISCOUNTS: readonly PlusDiscount[] = [
  { fromMonths: 3, off: [5, 100] },
  { fromMonths: 6, off: [10, 100] },
  { fromMonths: 12, off: [1, 6] },
];

/** The Grace Period after a Subscription ends (ADR-0008). */
export const GRACE_DAYS = 7;

export function billingConfig(config: Config): BillingConfig {
  return {
    enabled: config.BILLING_ENABLED,
    trialDays: config.TRIAL_DAYS,
    limits: {
      FREE: {
        signedInDevices: config.FREE_DEVICE_LIMIT,
        shareWorkspace: false,
        aiAnalysesPerMonth: config.FREE_AI_ANALYSES_PER_MONTH,
      },
      PLUS: {
        signedInDevices: config.PLUS_DEVICE_LIMIT,
        shareWorkspace: true,
        aiAnalysesPerMonth: config.PLUS_AI_ANALYSES_PER_MONTH,
      },
    },
    plusMonthlyPrice: { amount: BigInt(config.PLUS_MONTHLY_PRICE_IRR), currency: IRR },
    plusDiscounts: PLUS_DISCOUNTS,
    graceDays: GRACE_DAYS,
  };
}
