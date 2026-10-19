import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AccountDeletionPreview,
  AccountDeletionRefusal,
  SharedOwnedWorkspace,
} from '@daric/core';
import { and, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { DATABASE } from '../../common/di-tokens';
import type { Database, Executor } from '../../db/client';
import {
  auditLogs,
  authIdentities,
  invitations,
  users,
  workspaceMembers,
  workspaces,
} from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { verifyAgainstDummy, verifyPassword } from '../auth/passwords';
import { EntitlementsService } from '../billing/entitlements.service';

const refusal = (reason: AccountDeletionRefusal, message: string, details = {}) => ({
  message,
  reason,
  ...details,
});

/**
 * Deletes a User for good (docs/plan.md, Defaults): their login, Consents,
 * Subscription and every Workspace they own alone, with everything in it.
 * What they did in Workspaces of others stays, by nobody: their records lose
 * their author and audit rows their actor, IP and user agent. A Workspace they
 * own with others must first get a new Owner. Identity tables are out of reach
 * of Workspace scope, so this runs on the owner connection.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
  ) {}

  async preview(userId: string): Promise<AccountDeletionPreview> {
    const owned = await ownedWorkspaces(this.db, userId);
    const subscription = await this.entitlements.subscriptionOf(userId);
    // Only bought time still to come is worth a warning; the Trial cost nothing, and in the
    // Grace Period the bought time has already run out.
    const forfeited =
      subscription.billingEnabled &&
      subscription.plan === 'PLUS' &&
      !subscription.onTrial &&
      !subscription.inGracePeriod;
    return {
      sharedWorkspaces: owned.filter((w) => w.otherMembers > 0),
      deletedWorkspaces: owned
        .filter((w) => w.otherMembers === 0)
        .map(({ id, name }) => ({ id, name })),
      plusForfeitedUntil: forfeited ? subscription.expiresAt : null,
    };
  }

  /**
   * Checks the password again, then deletes the User. Refused with 403 for a
   * wrong password and with 409 while they own a Workspace others belong to.
   */
  async delete(userId: string, password: string): Promise<void> {
    const [identity] = await this.db
      .select({ secretHash: authIdentities.secretHash })
      .from(authIdentities)
      .where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, 'PASSWORD')));
    const ok = identity?.secretHash
      ? await verifyPassword(identity.secretHash, password)
      : await verifyAgainstDummy(password);
    if (!ok) {
      throw new ForbiddenException(refusal('WRONG_PASSWORD', 'The password is incorrect'));
    }

    await this.db.transaction(async (tx) => {
      // Locked so nobody joins the User or their Workspaces while they go.
      const [user] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!user) throw new UnauthorizedException();
      // Their memberships too: a transfer to them waits, or is seen once done.
      await tx
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, userId))
        .for('update');
      const ownedIds = tx
        .select({ id: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, 'OWNER')));
      await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(inArray(workspaces.id, ownedIds))
        .for('update');

      const owned = await ownedWorkspaces(tx, userId);
      const shared = owned.filter((w) => w.otherMembers > 0);
      if (shared.length > 0) {
        throw new ConflictException(
          refusal('OWNS_SHARED_WORKSPACE', 'Transfer ownership of shared Workspaces first', {
            sharedWorkspaces: shared,
          }),
        );
      }

      const joined = await tx
        .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.userId, userId), ne(workspaceMembers.role, 'OWNER')));
      for (const { workspaceId, role } of joined) {
        await this.audit.record(tx, {
          action: 'user.delete',
          actorUserId: null,
          workspaceId,
          metadata: { role },
        });
      }

      if (owned.length > 0) {
        await tx.delete(workspaces).where(
          inArray(
            workspaces.id,
            owned.map((w) => w.id),
          ),
        );
      }
      await anonymiseAuditRows(tx, userId);
      await this.forgetInvitationsTo(tx, user.email);
      // Cascades to their login, Signed-in Devices, mailed links, memberships,
      // Consents and Subscription; their records elsewhere lose their author.
      await tx.delete(users).where(eq(users.id, userId));
    });
  }

  /**
   * Takes the User's email off Invitations sent to it. One still waiting is
   * revoked and audited first: without an email it would be a link anyone
   * could accept.
   */
  private async forgetInvitationsTo(tx: Executor, email: string): Promise<void> {
    const sentToThem = sql`lower(${invitations.email}) = lower(${email})`;
    const revoked = await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          sentToThem,
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .returning({ id: invitations.id, workspaceId: invitations.workspaceId });
    for (const { id, workspaceId } of revoked) {
      await this.audit.record(tx, {
        action: 'invitation.revoke',
        actorUserId: null,
        workspaceId,
        metadata: { invitationId: id },
      });
    }
    await tx.update(invitations).set({ email: null }).where(sentToThem);
  }
}

/** The Workspaces the User owns, oldest first, with how many others belong to each. */
function ownedWorkspaces(db: Executor, userId: string): Promise<SharedOwnedWorkspace[]> {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      otherMembers: sql<number>`(
        SELECT count(*)::int FROM ${workspaceMembers} others
        WHERE others.workspace_id = ${workspaces.id} AND others.user_id <> ${userId}
      )`,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, 'OWNER')))
    .orderBy(workspaces.createdAt, workspaces.id);
}

/**
 * Keeps the audit rows the User appears in but drops who they were: the actor,
 * with the IP and user agent of their requests, and their id wherever the
 * metadata names it (e.g. `memberUserId` in rows of others).
 */
async function anonymiseAuditRows(tx: Executor, userId: string): Promise<void> {
  const mine = eq(auditLogs.actorUserId, userId);
  await tx
    .update(auditLogs)
    .set({
      actorUserId: sql`CASE WHEN ${mine} THEN NULL ELSE ${auditLogs.actorUserId} END`,
      ip: sql`CASE WHEN ${mine} THEN NULL ELSE ${auditLogs.ip} END`,
      userAgent: sql`CASE WHEN ${mine} THEN NULL ELSE ${auditLogs.userAgent} END`,
      metadata: sql`(
        SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
        FROM jsonb_each(${auditLogs.metadata})
        WHERE value <> to_jsonb(${userId}::text) AND NOT value @> jsonb_build_array(${userId}::text)
      )`,
    })
    .where(or(mine, sql`${auditLogs.metadata}::text LIKE ${`%${userId}%`}`));
}
