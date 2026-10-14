import { z } from 'zod';
import { emailSchema, emailTokenSchema } from './auth';
import { type WorkspaceRole, workspaceRoleSchema, workspaceSchema } from './workspace';

/** Roles an Invitation or a role change can give; a Workspace has one Owner, never made this way. */
export const assignableRoles = ['ADMIN', 'MEMBER', 'VIEWER'] as const;
export type AssignableRole = (typeof assignableRoles)[number];

/**
 * The Roles `actor` may give through an Invitation or a role change: the
 * Owner any but Owner, an Admin only Member and Viewer, others none.
 */
export function rolesAssignableBy(actor: WorkspaceRole): AssignableRole[] {
  switch (actor) {
    case 'OWNER':
      return [...assignableRoles];
    case 'ADMIN':
      return ['MEMBER', 'VIEWER'];
    default:
      return [];
  }
}

/**
 * Whether `actor` may change the Role of, or remove, a Member with Role
 * `target`: nobody touches the Owner, and an Admin not other Admins.
 */
export function mayManageMember(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  if (target === 'OWNER') return false;
  if (actor === 'OWNER') return true;
  return actor === 'ADMIN' && target !== 'ADMIN';
}

/** Whether `actor` may move a Member with Role `from` to Role `to`. */
export function mayChangeRole(
  actor: WorkspaceRole,
  from: WorkspaceRole,
  to: WorkspaceRole,
): boolean {
  return mayManageMember(actor, from) && (rolesAssignableBy(actor) as WorkspaceRole[]).includes(to);
}

/** A Member as the Members list shows them. Lists come in the order they joined. */
export const memberSchema = z.object({
  /** The membership's id, which the member routes take. */
  id: z.uuid(),
  userId: z.uuid(),
  email: z.email(),
  role: workspaceRoleSchema,
  joinedAt: z.iso.datetime(),
});
export type Member = z.infer<typeof memberSchema>;
export const memberListSchema = z.array(memberSchema);

export const updateMemberInputSchema = z.strictObject({ role: z.enum(assignableRoles) });
export type UpdateMemberInput = z.infer<typeof updateMemberInputSchema>;

export const invitationStatuses = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

/** An Invitation as its Workspace's Owner and Admins see it. Lists come newest first. */
export const invitationSchema = z.object({
  id: z.uuid(),
  /** Whom it was mailed to; only they can accept it. Null for a link anyone may accept once. */
  email: z.email().nullable(),
  role: z.enum(assignableRoles),
  status: z.enum(invitationStatuses),
  /** Null once the User who sent it is gone. */
  invitedByEmail: z.email().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type Invitation = z.infer<typeof invitationSchema>;

/** A Workspace's Invitations and whether its Owner's Plan lets it send more (ADR-0008). */
export const invitationListSchema = z.object({
  sharingAllowed: z.boolean(),
  invitations: z.array(invitationSchema),
});
export type InvitationList = z.infer<typeof invitationListSchema>;

/**
 * A new Invitation and its link. The link is shown this once: only its hash
 * is stored, so a lost link means revoking and inviting again.
 */
export const createdInvitationSchema = invitationSchema.extend({ link: z.url() });
export type CreatedInvitation = z.infer<typeof createdInvitationSchema>;

export const createInvitationInputSchema = z.strictObject({
  /** Mails the link there and binds the Invitation to it; without it, only a link is made. */
  email: emailSchema.exactOptional(),
  role: z.enum(assignableRoles),
});
export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;

/** The token of an Invitation link, sent in a body so it stays out of URLs and logs. */
export const invitationTokenInputSchema = z.object({ token: emailTokenSchema });
export type InvitationTokenInput = z.infer<typeof invitationTokenInputSchema>;

/** What a pending Invitation offers, shown before accepting it. */
export const invitationPreviewSchema = z.object({
  workspaceName: z.string(),
  role: z.enum(assignableRoles),
  invitedByEmail: z.email().nullable(),
  email: z.email().nullable(),
  expiresAt: z.iso.datetime(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

/** The Workspace just joined, with the new Role. */
export const acceptedInvitationSchema = z.object({ workspace: workspaceSchema });
export type AcceptedInvitation = z.infer<typeof acceptedInvitationSchema>;

/** Why accepting an Invitation was refused (with 403), when it was the User's to fix. */
export const invitationRefusals = ['EMAIL_NOT_VERIFIED', 'EMAIL_MISMATCH'] as const;
export type InvitationRefusal = (typeof invitationRefusals)[number];
