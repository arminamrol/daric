import { z } from 'zod';

/** What a User has paid for; a Business plan may come later. */
export const plans = ['FREE', 'PLUS'] as const;
export const planSchema = z.enum(plans);
export type Plan = z.infer<typeof planSchema>;

/**
 * What a User may do under their Plan, decided by the server (ADR-0008);
 * clients only show it. `null` means unlimited.
 */
export const entitlementsSchema = z.object({
  signedInDevices: z.number().int().positive().nullable(),
  /** Whether the User may invite others into a Workspace they own. */
  shareWorkspace: z.boolean(),
  aiAnalysesPerMonth: z.number().int().min(0).nullable(),
  aiAnalysesLeftThisMonth: z.number().int().min(0).nullable(),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;

/** The signed-in User's Subscription as the Subscription page shows it. */
export const subscriptionSchema = z.object({
  /** False on a self-hosted server: every Entitlement is unlimited and nothing is sold. */
  billingEnabled: z.boolean(),
  /** The Plan in effect now: Free once Plus time and its Grace Period have run out. */
  plan: planSchema,
  /** In the Trial: Plus time that comes only from signing up, nothing bought yet. */
  onTrial: z.boolean(),
  trialEndsAt: z.iso.datetime().nullable(),
  /** When the Plus time ends (or ended); null if the User never had any. */
  expiresAt: z.iso.datetime().nullable(),
  /**
   * When the Grace Period after `expiresAt` ends: until then Plus Entitlements
   * still apply; after it, extra Signed-in Devices are signed out and Members of
   * the User's Workspaces are suspended. Null if the User never had Plus time.
   */
  graceEndsAt: z.iso.datetime().nullable(),
  /** Plus time has run out but its Grace Period has not: time to renew. */
  inGracePeriod: z.boolean(),
  entitlements: entitlementsSchema,
});
export type Subscription = z.infer<typeof subscriptionSchema>;
