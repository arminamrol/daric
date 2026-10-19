import { and, eq, inArray, isNotNull, isNull, ne, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Executor } from '../../db/client';
import { workspaceMembers } from '../../db/schema';
import type { AuditService } from '../audit/audit.service';

/**
 * Suspending and restoring the Members of a Workspace whose Owner's Plus and
 * its Grace Period ended (ADR-0008). A suspended membership is kept, Role and
 * Consent included, but gives no access (WorkspaceGuard and row-level
 * security); restoring it gives everything back. The Owner is never suspended.
 * Owner connection: this runs outside any Workspace scope.
 */

const owners = alias(workspaceMembers, 'owners');

/** Memberships in the Workspaces `ownerId` owns. */
const ownedBy = (db: Executor, ownerId: string): SQL =>
  inArray(
    workspaceMembers.workspaceId,
    db
      .select({ workspaceId: owners.workspaceId })
      .from(owners)
      .where(and(eq(owners.userId, ownerId), eq(owners.role, 'OWNER'))),
  );

/** Whether the User owns a Workspace that has any other Member, suspended or not. */
export async function ownsSharedWorkspace(db: Executor, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(ownedBy(db, userId), ne(workspaceMembers.role, 'OWNER')))
    .limit(1);
  return row !== undefined;
}

async function change(
  tx: Executor,
  audit: AuditService,
  {
    where,
    suspendedAt,
    actorUserId,
  }: {
    where: SQL;
    /** When to suspend from; null restores. */
    suspendedAt: Date | null;
    actorUserId: string | null;
  },
): Promise<number> {
  const suspend = suspendedAt !== null;
  const changed = await tx
    .update(workspaceMembers)
    .set({ suspendedAt })
    .where(
      and(
        where,
        ne(workspaceMembers.role, 'OWNER'),
        suspend ? isNull(workspaceMembers.suspendedAt) : isNotNull(workspaceMembers.suspendedAt),
      ),
    )
    .returning({
      workspaceId: workspaceMembers.workspaceId,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
    });
  for (const member of changed) {
    await audit.record(tx, {
      action: suspend ? 'member.suspend' : 'member.restore',
      actorUserId,
      workspaceId: member.workspaceId,
      metadata: { memberUserId: member.userId, role: member.role },
    });
  }
  return changed.length;
}

/** Suspends the Members of every Workspace `ownerId` owns; returns how many. Audited without an actor. */
export function suspendMembersOf(
  tx: Executor,
  audit: AuditService,
  ownerId: string,
  now: Date,
): Promise<number> {
  return change(tx, audit, { where: ownedBy(tx, ownerId), suspendedAt: now, actorUserId: null });
}

/**
 * Restores the suspended Members of every Workspace `ownerId` owns; returns
 * how many. `actorUserId` is the Owner when their payment brought it about.
 */
export function restoreMembersOf(
  tx: Executor,
  audit: AuditService,
  ownerId: string,
  actorUserId: string | null = null,
): Promise<number> {
  return change(tx, audit, { where: ownedBy(tx, ownerId), suspendedAt: null, actorUserId });
}

/** The Owners of Workspaces with a suspended Member (of `only`, when given), to check their Plan again. */
export async function ownersWithSuspendedMembers(
  db: Executor,
  only?: readonly string[],
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ ownerId: owners.userId })
    .from(workspaceMembers)
    .innerJoin(
      owners,
      and(eq(owners.workspaceId, workspaceMembers.workspaceId), eq(owners.role, 'OWNER')),
    )
    .where(and(isNotNull(workspaceMembers.suspendedAt), only && inArray(owners.userId, [...only])));
  return rows.map((r) => r.ownerId);
}
