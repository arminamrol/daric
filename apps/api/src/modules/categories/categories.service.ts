import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { categoryKinds, categoryTree } from '@daric/core';
import type {
  Category,
  CategoryColor,
  CategoryIcon,
  CategoryKind,
  CreateCategoryInput,
  ReorderCategoriesInput,
  UpdateCategoryInput,
} from '@daric/core';
import { and, eq, inArray, isNull, max, sql, type SQL } from 'drizzle-orm';
import { isUuid, type Membership } from '../../common/request';
import { one } from '../../db/client';
import { categories, workspaces } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';

const columns = {
  id: categories.id,
  kind: categories.kind,
  parentId: categories.parentId,
  name: categories.name,
  icon: categories.icon,
  color: categories.color,
  position: categories.position,
  archivedAt: categories.archivedAt,
};

type Row = Omit<Category, 'archived'> & { archivedAt: Date | null };

function toWire(row: { icon: string; color: string } & Omit<Row, 'icon' | 'color'>): Category {
  const { archivedAt, ...category } = row;
  // Only core's icons and colors are ever written.
  return {
    ...category,
    icon: row.icon as CategoryIcon,
    color: row.color as CategoryColor,
    archived: archivedAt !== null,
  };
}

/** Each kind's top-level Categories in order, each followed by its children. */
function inTreeOrder(list: Category[]): Category[] {
  return categoryKinds.flatMap((kind) =>
    categoryTree(list.filter((c) => c.kind === kind)).flatMap(({ children, ...top }) => [
      top,
      ...children,
    ]),
  );
}

const siblingsOf = (kind: CategoryKind, parentId: string | null) =>
  and(
    eq(categories.kind, kind),
    parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId),
  );

// Queries filter by id only: WorkspaceGuard and row-level security keep them
// inside the caller's Workspace (ADR-0001). One level deep, same kind as the
// parent, and no active Category under an archived parent; writes lock the
// rows those rules read, so concurrent writes cannot break them together.
@Injectable()
export class CategoriesService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  private async select(where: SQL | undefined): Promise<Category[]> {
    const rows = await scopedTx()
      .select(columns)
      .from(categories)
      .where(where)
      .orderBy(categories.position, categories.createdAt, categories.id);
    return rows.map(toWire);
  }

  async list(options: { includeArchived: boolean }): Promise<Category[]> {
    return inTreeOrder(
      await this.select(options.includeArchived ? undefined : isNull(categories.archivedAt)),
    );
  }

  async get(categoryId: string): Promise<Category> {
    if (!isUuid(categoryId)) throw new NotFoundException();
    const [category] = await this.select(eq(categories.id, categoryId));
    if (!category) throw new NotFoundException();
    return category;
  }

  /**
   * Reads and locks the Categories a write's rules depend on, in id order so
   * two writes never wait on each other. A concurrent move or archive of the
   * same rows then waits, and the checks after this see its result.
   */
  private async lock(ids: readonly string[]): Promise<Map<string, Category>> {
    const rows = await scopedTx()
      .select(columns)
      .from(categories)
      .where(inArray(categories.id, [...new Set(ids)]))
      .orderBy(categories.id)
      .for('update');
    return new Map(rows.map((row) => [row.id, toWire(row)]));
  }

  private async hasChild(categoryId: string, { activeOnly }: { activeOnly: boolean }) {
    const [child] = await scopedTx()
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.parentId, categoryId),
          activeOnly ? isNull(categories.archivedAt) : undefined,
        ),
      )
      .limit(1);
    return child !== undefined;
  }

  /** Throws a 400 unless `parent` may hold a Category of `kind`. */
  private assertParent(kind: CategoryKind, parent: Category | undefined): asserts parent {
    if (!parent) throw new BadRequestException('Parent Category not found');
    if (parent.parentId !== null) {
      throw new BadRequestException('A parent Category must be top-level');
    }
    if (parent.kind !== kind) {
      throw new BadRequestException('A parent Category must be of the same kind');
    }
  }

  private assertNotArchived(parent: Category | undefined) {
    if (parent?.archived) throw new ConflictException('The parent Category is archived');
  }

  // Positions are not locked: two Categories created at once may share one,
  // and `createdAt` then orders them until the next reorder.
  private async nextPosition(kind: CategoryKind, parentId: string | null): Promise<number> {
    const [row] = await scopedTx()
      .select({ last: max(categories.position) })
      .from(categories)
      .where(siblingsOf(kind, parentId));
    const last = row?.last ?? null;
    return last === null ? 0 : last + 1;
  }

  async create(
    membership: Membership,
    userId: string,
    input: CreateCategoryInput,
  ): Promise<Category> {
    const { workspaceId } = membership;
    const tx = scopedTx();
    // Row-level security would refuse the insert anyway; answer 404 like every other route.
    const [visible] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    if (!visible) throw new NotFoundException();
    const parentId = input.parentId ?? null;
    if (parentId !== null) {
      const parent = (await this.lock([parentId])).get(parentId);
      this.assertParent(input.kind, parent);
      this.assertNotArchived(parent);
    }
    const created = one(
      await tx
        .insert(categories)
        .values({
          ...input,
          parentId,
          workspaceId,
          position: await this.nextPosition(input.kind, parentId),
        })
        .returning({ id: categories.id }),
    );
    await this.audit.record(tx, {
      action: 'category.create',
      actorUserId: userId,
      workspaceId,
      metadata: { categoryId: created.id },
    });
    return this.get(created.id);
  }

  async update(
    membership: Membership,
    userId: string,
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<Category> {
    const seen = await this.get(categoryId);
    const tx = scopedTx();
    const { archived, parentId, ...fields } = input;
    const locked = await this.lock(
      [categoryId, seen.parentId, parentId].filter((id) => typeof id === 'string'),
    );
    const current = locked.get(categoryId);
    if (!current) throw new NotFoundException();
    // Moved by someone else between the read and the lock: its new parent is not locked.
    if (current.parentId !== seen.parentId) {
      throw new ConflictException('The Category changed meanwhile; try again');
    }
    const moving = parentId !== undefined && parentId !== current.parentId;
    const nextParentId = moving ? parentId : current.parentId;
    const willBeArchived = archived ?? current.archived;

    if (moving && parentId !== null) {
      if (parentId === categoryId) {
        throw new BadRequestException('A Category cannot be its own parent');
      }
      this.assertParent(current.kind, locked.get(parentId));
      if (await this.hasChild(categoryId, { activeOnly: false })) {
        throw new BadRequestException('A Category with children cannot have a parent');
      }
    }
    if (willBeArchived && !current.archived) {
      if (await this.hasChild(categoryId, { activeOnly: true })) {
        throw new ConflictException('Archive the children first');
      }
    }
    if (!willBeArchived && nextParentId !== null) this.assertNotArchived(locked.get(nextParentId));

    await tx
      .update(categories)
      .set({
        ...fields,
        ...(moving && {
          parentId: nextParentId,
          position: await this.nextPosition(current.kind, nextParentId),
        }),
        // Archiving again keeps the first archive time.
        ...(archived !== undefined && {
          archivedAt: archived ? sql`coalesce(${categories.archivedAt}, now())` : null,
        }),
        version: sql`${categories.version} + 1`,
      })
      .where(eq(categories.id, categoryId));
    await this.audit.record(tx, {
      action: 'category.update',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { categoryId, fields: Object.keys(input) },
    });
    return this.get(categoryId);
  }

  /** Sets the order of one parent's children (or one kind's top level); returns them in it. */
  async reorder(
    membership: Membership,
    userId: string,
    input: ReorderCategoriesInput,
  ): Promise<Category[]> {
    const tx = scopedTx();
    const named = await this.select(inArray(categories.id, input.ids));
    const [first] = named;
    if (!first || named.length !== input.ids.length) {
      throw new BadRequestException('Category not found');
    }
    const siblings = await this.select(siblingsOf(first.kind, first.parentId));
    const siblingIds = new Set(siblings.map((c) => c.id));
    if (siblings.length !== input.ids.length || !input.ids.every((id) => siblingIds.has(id))) {
      throw new BadRequestException('Name every Category under one parent, and nothing else');
    }
    for (const [position, id] of input.ids.entries()) {
      await tx
        .update(categories)
        .set({ position, version: sql`${categories.version} + 1` })
        .where(eq(categories.id, id));
    }
    await this.audit.record(tx, {
      action: 'category.reorder',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { categoryIds: input.ids },
    });
    return this.select(siblingsOf(first.kind, first.parentId));
  }
}
