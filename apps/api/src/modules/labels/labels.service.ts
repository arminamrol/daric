import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateLabelInput, Label, UpdateLabelInput } from '@daric/core';
import { asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { isUniqueViolation } from '../../common/db-errors';
import { isUuid, type Membership } from '../../common/request';
import { one } from '../../db/client';
import { labels, workspaces } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';

const columns = {
  id: labels.id,
  name: labels.name,
  controllable: labels.controllable,
  archivedAt: labels.archivedAt,
};

function toWire({ archivedAt, ...label }: Omit<Label, 'archived'> & { archivedAt: Date | null }) {
  return { ...label, archived: archivedAt !== null };
}

export const NAME_TAKEN = 'Another Label in the Workspace has this name, ignoring case';

// Queries filter by id only: WorkspaceGuard and row-level security keep them
// inside the caller's Workspace (ADR-0001). A unique index keeps names unique
// in a Workspace, ignoring case, archived Labels included.
@Injectable()
export class LabelsService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  private async select(where: SQL | undefined): Promise<Label[]> {
    const rows = await scopedTx()
      .select(columns)
      .from(labels)
      .where(where)
      .orderBy(asc(sql`lower(${labels.name})`), labels.id);
    return rows.map(toWire);
  }

  async list(options: { includeArchived: boolean }): Promise<Label[]> {
    return this.select(options.includeArchived ? undefined : isNull(labels.archivedAt));
  }

  async get(labelId: string): Promise<Label> {
    if (!isUuid(labelId)) throw new NotFoundException();
    const [label] = await this.select(eq(labels.id, labelId));
    if (!label) throw new NotFoundException();
    return label;
  }

  async create(membership: Membership, userId: string, input: CreateLabelInput): Promise<Label> {
    const { workspaceId } = membership;
    const tx = scopedTx();
    // Row-level security would refuse the insert anyway; answer 404 like every other route.
    const [visible] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    if (!visible) throw new NotFoundException();
    const created = one(
      await this.write(() =>
        tx
          .insert(labels)
          .values({ ...input, workspaceId })
          .returning({ id: labels.id }),
      ),
    );
    await this.audit.record(tx, {
      action: 'label.create',
      actorUserId: userId,
      workspaceId,
      metadata: { labelId: created.id },
    });
    return this.get(created.id);
  }

  async update(
    membership: Membership,
    userId: string,
    labelId: string,
    input: UpdateLabelInput,
  ): Promise<Label> {
    await this.get(labelId);
    const tx = scopedTx();
    const { archived, ...fields } = input;
    await this.write(() =>
      tx
        .update(labels)
        .set({
          ...fields,
          // Archiving again keeps the first archive time.
          ...(archived !== undefined && {
            archivedAt: archived ? sql`coalesce(${labels.archivedAt}, now())` : null,
          }),
          version: sql`${labels.version} + 1`,
        })
        .where(eq(labels.id, labelId)),
    );
    await this.audit.record(tx, {
      action: 'label.update',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { labelId, fields: Object.keys(input) },
    });
    return this.get(labelId);
  }

  /** Runs a write that may hit the unique name, answering 409 if it does. */
  private async write<T>(query: () => Promise<T>): Promise<T> {
    try {
      return await query();
    } catch (error) {
      if (isUniqueViolation(error, 'labels_workspace_id_name_key'))
        throw new ConflictException(NAME_TAKEN);
      throw error;
    }
  }
}
