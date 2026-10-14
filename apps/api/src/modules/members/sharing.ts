import type { AuditAction, WorkspaceRole } from '@daric/core';
import { and, eq, isNull } from 'drizzle-orm';
import type { ClientInfo } from '../../common/request';
import type { Executor } from '../../db/client';
import { userConsents, workspaceMembers } from '../../db/schema';
import type { AuditService } from '../audit/audit.service';

/** The User who owns the Workspace; every Workspace has exactly one. */
export async function ownerOf(db: Executor, workspaceId: string): Promise<string> {
  const [owner] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'OWNER')));
  if (!owner) throw new Error(`Workspace ${workspaceId} has no Owner`);
  return owner.userId;
}

/** The User's Role in the Workspace, or null when they are not a Member of it. */
export async function roleIn(
  db: Executor,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  return member?.role ?? null;
}

/**
 * Revokes the User's live sharing Consents matching `where` and audits each.
 * `workspaceId` is where the audit row goes; null once the Workspace is gone.
 */
export async function revokeSharingConsents(
  tx: Executor,
  audit: AuditService,
  {
    userId,
    workspaceId,
    consentId,
    actorUserId,
    client,
  }: {
    userId: string;
    workspaceId: string | null;
    /** Just this one; otherwise the User's live one for `workspaceId`. */
    consentId?: string;
    actorUserId: string;
    client: ClientInfo;
  },
): Promise<void> {
  const revoked = await tx
    .update(userConsents)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userConsents.userId, userId),
        consentId
          ? eq(userConsents.id, consentId)
          : workspaceId
            ? eq(userConsents.workspaceId, workspaceId)
            : isNull(userConsents.workspaceId),
        eq(userConsents.purpose, 'WORKSPACE_SHARING'),
        isNull(userConsents.revokedAt),
      ),
    )
    .returning({ id: userConsents.id });
  for (const { id } of revoked) {
    await audit.record(tx, {
      action: 'consent.revoke',
      actorUserId,
      workspaceId,
      client,
      metadata: { consentId: id, memberUserId: userId, purpose: 'WORKSPACE_SHARING' },
    });
  }
}

export interface EndSharing {
  workspaceId: string;
  /** The Member leaving or being removed. */
  member: { userId: string; role: WorkspaceRole };
  /** Who ended it: the Member themselves when they leave. */
  actorUserId: string;
  action: Extract<AuditAction, 'member.remove' | 'member.leave'>;
  client: ClientInfo;
}

/**
 * Ends a membership: revokes the Member's sharing Consent, audits it, then
 * deletes the membership, so their next request is refused. The membership
 * goes last because in Workspace scope a User who left can write nothing more.
 * Never for the Owner.
 */
export async function endSharing(
  tx: Executor,
  audit: AuditService,
  { workspaceId, member, actorUserId, action, client }: EndSharing,
): Promise<void> {
  if (member.role === 'OWNER') throw new Error('The Owner cannot leave their Workspace');
  await revokeSharingConsents(tx, audit, {
    userId: member.userId,
    workspaceId,
    actorUserId,
    client,
  });
  await audit.record(tx, {
    action,
    actorUserId,
    workspaceId,
    client,
    metadata: { memberUserId: member.userId, role: member.role },
  });
  await tx
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, member.userId),
      ),
    );
}
