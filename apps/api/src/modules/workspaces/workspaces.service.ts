import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateWorkspaceInput, Workspace } from '@daric/core';
import { and, eq, sql } from 'drizzle-orm';
import type { Membership } from '../../common/request';
import { DATABASE } from '../../common/tokens';
import type { Database } from '../../db/client';
import { workspaceMembers, workspaces } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';

const columns = {
  id: workspaces.id,
  type: workspaces.type,
  name: workspaces.name,
  baseCurrency: workspaces.baseCurrency,
  calendar: workspaces.calendar,
  timezone: workspaces.timezone,
};

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Every Workspace the User is a Member of, with their Role. Not Workspace-scoped. */
  listForUser(userId: string): Promise<Workspace[]> {
    return this.db
      .select({ ...columns, role: workspaceMembers.role })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, userId)),
      )
      .orderBy(workspaces.createdAt);
  }

  // Scoped reads and writes below filter by id only: WorkspaceGuard and
  // row-level security decide whether the caller may see the Workspace.

  async get(membership: Membership): Promise<Workspace> {
    const [workspace] = await scopedTx()
      .select(columns)
      .from(workspaces)
      .where(eq(workspaces.id, membership.workspaceId));
    if (!workspace) throw new NotFoundException();
    return { ...workspace, role: membership.role };
  }

  async update(
    membership: Membership,
    userId: string,
    input: UpdateWorkspaceInput,
  ): Promise<Workspace> {
    const { workspaceId } = membership;
    const tx = scopedTx();
    const updated = await tx
      .update(workspaces)
      .set({ name: input.name, version: sql`${workspaces.version} + 1` })
      .where(eq(workspaces.id, workspaceId))
      .returning({ id: workspaces.id });
    if (updated.length === 0) throw new NotFoundException();
    await this.audit.record(tx, {
      action: 'workspace.update',
      actorUserId: userId,
      workspaceId,
      metadata: { fields: Object.keys(input) },
    });
    return this.get(membership);
  }
}
