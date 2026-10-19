import type { Entitlements, Plan, Subscription } from '@daric/core';
import { DAY } from '../../common/time';
import type { BillingConfig } from './billing-config';

/** A `subscriptions` row as the Entitlement service needs it. */
export interface StoredSubscription {
  plan: Plan;
  trialEndsAt: Date | null;
  expiresAt: Date | null;
}

/** The Trial a new User starts with: `trialDays` (TRIAL_DAYS) of Plus from `now`. */
export function trialFor(now: Date, trialDays: number): StoredSubscription {
  const end = new Date(now.getTime() + trialDays * DAY);
  return { plan: 'PLUS', trialEndsAt: end, expiresAt: end };
}

const UNLIMITED: Entitlements = {
  signedInDevices: null,
  shareWorkspace: true,
  aiAnalysesPerMonth: null,
  aiAnalysesLeftThisMonth: null,
};

/** When the Grace Period after Plus time ending at `expiresAt` ends (ADR-0008). */
export function graceEnd(expiresAt: Date, graceDays: number): Date {
  return new Date(expiresAt.getTime() + graceDays * DAY);
}

/**
 * The one place that decides what a User may do (ADR-0008): the Plan in effect
 * at `now` and its limits from config, or everything unlimited when billing is
 * disabled. A User without a Subscription is on Free. Plus applies until its
 * expiry and through the Grace Period after it (`billing.graceDays`), Free after.
 */
export function subscriptionView(
  subscription: StoredSubscription | undefined,
  context: { now: Date; billing: BillingConfig; aiAnalysesUsedThisMonth: number },
): Subscription {
  const { now, billing } = context;
  const trialEndsAt = subscription?.trialEndsAt ?? null;
  const expiresAt = subscription?.expiresAt ?? null;
  const graceEndsAt = expiresAt && graceEnd(expiresAt, billing.graceDays);
  const running = expiresAt !== null && now < expiresAt;
  const inGracePeriod = !running && graceEndsAt !== null && now < graceEndsAt;
  const plan: Plan = subscription && (running || inGracePeriod) ? subscription.plan : 'FREE';
  // Plus bought on top of the Trial moves the expiry past the Trial's end.
  const onTrial = running && trialEndsAt !== null && expiresAt.getTime() <= trialEndsAt.getTime();

  let entitlements = UNLIMITED;
  if (billing.enabled) {
    const limits = billing.limits[plan];
    entitlements = {
      ...limits,
      aiAnalysesLeftThisMonth:
        limits.aiAnalysesPerMonth === null
          ? null
          : Math.max(0, limits.aiAnalysesPerMonth - context.aiAnalysesUsedThisMonth),
    };
  }

  return {
    billingEnabled: billing.enabled,
    plan,
    onTrial,
    trialEndsAt: trialEndsAt?.toISOString() ?? null,
    expiresAt: expiresAt?.toISOString() ?? null,
    graceEndsAt: graceEndsAt?.toISOString() ?? null,
    inGracePeriod,
    entitlements,
  };
}
