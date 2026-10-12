import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { amountToWire, plannedItemProblem } from '@daric/core';
import type {
  CreatePlannedItemInput,
  PlannedItemWire,
  TransactionType,
  UpdatePlannedItemInput,
} from '@daric/core';
import { asc, eq, sql, type SQL } from 'drizzle-orm';
import { isUuid, type Membership } from '../../common/request';
import { one } from '../../db/client';
import { categories, plannedItems, workspaces } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';

const columns = {
  id: plannedItems.id,
  name: plannedItems.name,
  kind: plannedItems.kind,
  type: plannedItems.type,
  categoryId: plannedItems.categoryId,
  amount: plannedItems.amount,
  currency: plannedItems.currency,
  startOn: plannedItems.startOn,
  endOn: plannedItems.endOn,
  version: plannedItems.version,
};

type Row = { [K in keyof typeof columns]: (typeof plannedItems.$inferSelect)[K] };

function toWire(row: Row): PlannedItemWire {
  return { ...row, amount: amountToWire(row.amount) };
}

// Queries filter by id only: WorkspaceGuard and row-level security keep them
// inside the caller's Workspace (ADR-0001); the composite foreign key keeps a
// Planned Item's Category in its Workspace and of its type.
@Injectable()
export class PlannedItemsService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  private async select(where: SQL | undefined): Promise<Row[]> {
    return scopedTx()
      .select(columns)
      .from(plannedItems)
      .where(where)
      .orderBy(asc(plannedItems.createdAt), asc(plannedItems.id));
  }

  async list(): Promise<PlannedItemWire[]> {
    return (await this.select(undefined)).map(toWire);
  }

  private async row(itemId: string): Promise<Row> {
    if (!isUuid(itemId)) throw new NotFoundException();
    const [row] = await this.select(eq(plannedItems.id, itemId));
    if (!row) throw new NotFoundException();
    return row;
  }

  async get(itemId: string): Promise<PlannedItemWire> {
    return toWire(await this.row(itemId));
  }

  async create(
    membership: Membership,
    userId: string,
    input: CreatePlannedItemInput,
  ): Promise<PlannedItemWire> {
    const { workspaceId } = membership;
    const item = { ...input, categoryId: input.categoryId ?? null, endOn: input.endOn ?? null };
    if (item.categoryId) await this.assertActiveCategory(item.categoryId, item.type);
    const tx = scopedTx();
    const [workspace] = await tx
      .select({ baseCurrency: workspaces.baseCurrency })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    // Row-level security hides a Workspace the caller is not a Member of.
    if (!workspace) throw new NotFoundException();
    const created = one(
      await tx
        .insert(plannedItems)
        .values({ ...item, workspaceId, currency: workspace.baseCurrency })
        .returning({ id: plannedItems.id }),
    );
    await this.audit.record(tx, {
      action: 'planned_item.create',
      actorUserId: userId,
      workspaceId,
      metadata: { plannedItemId: created.id },
    });
    return this.get(created.id);
  }

  async update(
    membership: Membership,
    userId: string,
    itemId: string,
    input: UpdatePlannedItemInput,
  ): Promise<PlannedItemWire> {
    const current = await this.row(itemId);
    const problem = plannedItemProblem({ ...current, ...input });
    if (problem) throw new BadRequestException(problem);
    // An archived Category the item already has may stay.
    if (input.categoryId && input.categoryId !== current.categoryId) {
      await this.assertActiveCategory(input.categoryId, current.type);
    }
    const tx = scopedTx();
    await tx
      .update(plannedItems)
      .set({ ...input, version: sql`${plannedItems.version} + 1` })
      .where(eq(plannedItems.id, itemId));
    await this.audit.record(tx, {
      action: 'planned_item.update',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { plannedItemId: itemId, fields: Object.keys(input) },
    });
    return this.get(itemId);
  }

  async remove(membership: Membership, userId: string, itemId: string): Promise<void> {
    await this.row(itemId);
    const tx = scopedTx();
    await tx.delete(plannedItems).where(eq(plannedItems.id, itemId));
    await this.audit.record(tx, {
      action: 'planned_item.delete',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { plannedItemId: itemId },
    });
  }

  private async assertActiveCategory(categoryId: string, type: TransactionType): Promise<void> {
    const [category] = await scopedTx()
      .select({ kind: categories.kind, archivedAt: categories.archivedAt })
      .from(categories)
      .where(eq(categories.id, categoryId));
    if (!category) throw new BadRequestException('No such Category');
    if (category.kind !== type) {
      throw new BadRequestException('The Category is not of the Planned Item’s type');
    }
    if (category.archivedAt) throw new BadRequestException('The Category is archived');
  }
}
