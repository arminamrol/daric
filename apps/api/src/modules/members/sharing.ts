import type { AuditAction, WorkspaceRole } from '@daric/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { ClientInfo } from '../../common/request';
import type { Database, Executor } from '../../db/client';
import { users, userConsents, workspaceMembers } from '../../db/schema';
import type { AuditService } from '../audit/audit.service';

/**
 * The emails of Users by id. Identity tables are out of reach of Workspace
 * scope, so this reads on the owner connection, and only ids the caller
 * already found in the Workspace.
 */
export async function emailsOf(db: Database, userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.email]));
}

/** The User who owns the Workspace; every Workspace has exactly one. */
export async function ownerOf(db: Executor, workspaceId: string): Promise<string> {
  const [owner] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'OWNER')));
  if (!owner) throw new Error(`Workspace ${workspaceId} has no Owner`);
  return owner.userId;
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
  const revoked = await tx
    .update(userConsents)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userConsents.userId, member.userId),
        eq(userConsents.workspaceId, workspaceId),
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
      metadata: { consentId: id, memberUserId: member.userId, purpose: 'WORKSPACE_SHARING' },
    });
  }
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
