import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Consent } from '@daric/core';
import { and, desc, eq } from 'drizzle-orm';
import { DATABASE } from '../../common/di-tokens';
import { type ClientInfo, isUuid } from '../../common/request';
import type { Database } from '../../db/client';
import { userConsents, workspaceMembers, workspaces } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { endSharing } from './sharing';

/**
 * The signed-in User's own Consents. They belong to the User, across
 * Workspaces, so this runs on the owner connection filtered by the User.
 */
@Injectable()
export class ConsentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<Consent[]> {
    const rows = await this.db
      .select({
        id: userConsents.id,
        purpose: userConsents.purpose,
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        policyVersion: userConsents.policyVersion,
        grantedAt: userConsents.grantedAt,
        revokedAt: userConsents.revokedAt,
      })
      .from(userConsents)
      .leftJoin(workspaces, eq(workspaces.id, userConsents.workspaceId))
      .where(eq(userConsents.userId, userId))
      .orderBy(desc(userConsents.grantedAt), desc(userConsents.id));
    return rows.map(({ workspaceId, workspaceName, grantedAt, revokedAt, ...row }) => ({
      ...row,
      workspace:
        workspaceId && workspaceName !== null ? { id: workspaceId, name: workspaceName } : null,
      grantedAt: grantedAt.toISOString(),
      revokedAt: revokedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Revokes a Consent at once. Revoking workspace sharing ends the User's
   * membership in that Workspace, so their next request there is refused.
   * Revoking a revoked Consent changes nothing.
   */
  async revoke(userId: string, consentId: string, client: ClientInfo): Promise<void> {
    if (!isUuid(consentId)) throw new NotFoundException();
    await this.db.transaction(async (tx) => {
      const [consent] = await tx
        .select()
        .from(userConsents)
        .where(and(eq(userConsents.id, consentId), eq(userConsents.userId, userId)))
        .for('update');
      if (!consent) throw new NotFoundException();
      if (consent.revokedAt || !consent.workspaceId) return;
      const { workspaceId } = consent;
      const [member] = await tx
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
        );
      if (member && member.role !== 'OWNER') {
        await endSharing(tx, this.audit, {
          workspaceId,
          member: { userId, role: member.role },
          actorUserId: userId,
          action: 'member.leave',
          client,
        });
      } else {
        await tx
          .update(userConsents)
          .set({ revokedAt: new Date() })
          .where(eq(userConsents.id, consent.id));
      }
    });
  }
}
