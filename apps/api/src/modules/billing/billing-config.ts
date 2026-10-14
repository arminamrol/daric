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
}

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
  };
}
