import { z } from 'zod';

/** What a Consent permits; AI analysis comes with the AI tickets. */
export const consentPurposes = ['WORKSPACE_SHARING'] as const;
export type ConsentPurpose = (typeof consentPurposes)[number];

/**
 * The policy text each purpose's Consent is given against. A new version
 * means asking again; Consents keep the version they were given under.
 */
export const consentPolicyVersions: Readonly<Record<ConsentPurpose, string>> = {
  WORKSPACE_SHARING: '2026-10-14',
};

/** One of the User's Consents. Lists come newest first, revoked ones included. */
export const consentSchema = z.object({
  id: z.uuid(),
  purpose: z.enum(consentPurposes),
  /** The Workspace it is about; null once that Workspace is gone. */
  workspace: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  policyVersion: z.string(),
  grantedAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});
export type Consent = z.infer<typeof consentSchema>;
export const consentListSchema = z.array(consentSchema);
