import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  hasRole,
  mayChangeRole,
  mayManageMember,
  type Member,
  type UpdateMemberInput,
} from '@daric/core';
import { eq, sql } from 'drizzle-orm';
import { DATABASE } from '../../common/di-tokens';
import { type ClientInfo, isUuid, type Membership } from '../../common/request';
import { type Database, one } from '../../db/client';
import { workspaceMembers } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';
import { emailsOf, endSharing } from './sharing';

const columns = {
  id: workspaceMembers.id,
  userId: workspaceMembers.userId,
  role: workspaceMembers.role,
  createdAt: workspaceMembers.createdAt,
};

/** Who belongs to a Workspace, and changing their Roles by the role matrix (docs/plan.md). */
@Injectable()
export class MembersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<Member[]> {
    const rows = await scopedTx()
      .select(columns)
      .from(workspaceMembers)
      .orderBy(workspaceMembers.createdAt, workspaceMembers.id);
    return this.withEmails(rows);
  }

  async changeRole(
    membership: Membership,
    userId: string,
    memberId: string,
    { role }: UpdateMemberInput,
  ): Promise<Member> {
    const tx = scopedTx();
    const target = await this.find(memberId);
    if (target.userId === userId || !mayChangeRole(membership.role, target.role, role)) {
      throw new ForbiddenException();
    }
    if (target.role === role) return one(await this.withEmails([target]));
    const [updated] = await tx
      .update(workspaceMembers)
      .set({ role, version: sql`${workspaceMembers.version} + 1` })
      .where(eq(workspaceMembers.id, target.id))
      .returning(columns);
    if (!updated) throw new NotFoundException();
    await this.audit.record(tx, {
      action: 'member.role_change',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { memberUserId: target.userId, from: target.role, to: role },
    });
    return one(await this.withEmails([updated]));
  }

  /**
   * Removes a Member (Owner or Admin, by the role matrix) or lets any Member
   * but the Owner leave. Their sharing Consent is revoked with it.
   */
  async remove(
    membership: Membership,
    userId: string,
    memberId: string,
    client: ClientInfo,
  ): Promise<void> {
    const target = await this.find(memberId);
    const leaving = target.userId === userId;
    const allowed = leaving
      ? target.role !== 'OWNER'
      : hasRole(membership.role, 'ADMIN') && mayManageMember(membership.role, target.role);
    if (!allowed) throw new ForbiddenException();
    await endSharing(scopedTx(), this.audit, {
      workspaceId: membership.workspaceId,
      member: target,
      actorUserId: userId,
      action: leaving ? 'member.leave' : 'member.remove',
      client,
    });
  }

  private async find(memberId: string) {
    if (!isUuid(memberId)) throw new NotFoundException();
    const [row] = await scopedTx()
      .select(columns)
      .from(workspaceMembers)
      .where(eq(workspaceMembers.id, memberId));
    if (!row) throw new NotFoundException();
    return row;
  }

  private async withEmails(rows: Row[]): Promise<Member[]> {
    const emails = await emailsOf(
      this.db,
      rows.map((r) => r.userId),
    );
    return rows.map(({ createdAt, ...row }) => ({
      ...row,
      email: emails.get(row.userId) ?? '',
      joinedAt: createdAt.toISOString(),
    }));
  }
}

interface Row {
  id: string;
  userId: string;
  role: Member['role'];
  createdAt: Date;
}
