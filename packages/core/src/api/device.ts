import { z } from 'zod';

/**
 * Header a native app sends on sign-in to name its Signed-in Device (a phone
 * model); browsers are named from their user agent instead.
 */
export const DEVICE_NAME_HEADER = 'X-Daric-Device';
export const deviceNameSchema = z.string().trim().min(1).max(100);

/**
 * Why a refresh was refused with an explanation for the User: another login
 * went past their device Entitlement, or they signed this device out from
 * another one. Any other refusal (logout, expiry, reuse) carries no reason.
 */
export const signedOutReasons = ['DEVICE_LIMIT', 'SIGNED_OUT_REMOTELY'] as const;
export type SignedOutReason = (typeof signedOutReasons)[number];
export const signedOutReasonSchema = z.enum(signedOutReasons);

/** One of the User's live logins (one refresh-token family). */
export const signedInDeviceSchema = z.object({
  id: z.uuid(),
  /** Browser and OS, or phone model; null when the client did not say. */
  name: z.string().nullable(),
  signedInAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
  /** The device this request came from. */
  current: z.boolean(),
});
export type SignedInDevice = z.infer<typeof signedInDeviceSchema>;
/** Most recently used first. */
export const signedInDeviceListSchema = z.array(signedInDeviceSchema);
