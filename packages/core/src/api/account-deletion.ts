import { z } from 'zod';

const workspaceRefSchema = z.object({ id: z.uuid(), name: z.string() });

/** A Workspace the User owns that others belong to: ownership must go to one of them first. */
export const sharedOwnedWorkspaceSchema = workspaceRefSchema.extend({
  otherMembers: z.number().int().positive(),
});
export type SharedOwnedWorkspace = z.infer<typeof sharedOwnedWorkspaceSchema>;

/** What deleting the signed-in User's account would do, shown before they confirm. */
export const accountDeletionPreviewSchema = z.object({
  /** Deleting is refused while this is not empty. */
  sharedWorkspaces: z.array(sharedOwnedWorkspaceSchema),
  /** Workspaces the User owns alone, deleted with everything in them. */
  deletedWorkspaces: z.array(workspaceRefSchema),
  /** When the bought Plus time that would be forfeited ends; null when there is none. */
  plusForfeitedUntil: z.iso.datetime().nullable(),
});
export type AccountDeletionPreview = z.infer<typeof accountDeletionPreviewSchema>;

/** Deleting an account asks for the password again, whatever the session. */
export const deleteAccountInputSchema = z.object({
  // Like login, only bound its size: a stored password may predate today's rules.
  password: z.string().min(1).max(128),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;

/**
 * Why deleting an account was refused: the password was wrong (403), or the
 * User still owns a Workspace others belong to (409, with `sharedWorkspaces`).
 */
export const accountDeletionRefusals = ['WRONG_PASSWORD', 'OWNS_SHARED_WORKSPACE'] as const;
export type AccountDeletionRefusal = (typeof accountDeletionRefusals)[number];
