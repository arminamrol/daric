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
// parent, and no active Category under an archived parent.
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

  /** The parent a Category of `kind` may have, or a 400 saying why not. */
  private async parent(kind: CategoryKind, parentId: string): Promise<Category> {
    const [parent] = await this.select(eq(categories.id, parentId));
    if (!parent) throw new BadRequestException('Parent Category not found');
    if (parent.parentId !== null) {
      throw new BadRequestException('A parent Category must be top-level');
    }
    if (parent.kind !== kind) {
      throw new BadRequestException('A parent Category must be of the same kind');
    }
    return parent;
  }

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
      const parent = await this.parent(input.kind, parentId);
      if (parent.archived) throw new ConflictException('The parent Category is archived');
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
    const current = await this.get(categoryId);
    const tx = scopedTx();
    const { archived, parentId, ...fields } = input;
    const moving = parentId !== undefined && parentId !== current.parentId;
    const nextParentId = moving ? parentId : current.parentId;
    const willBeArchived = archived ?? current.archived;

    if (moving && parentId !== null) {
      if (parentId === categoryId) {
        throw new BadRequestException('A Category cannot be its own parent');
      }
      await this.parent(current.kind, parentId);
      const [child] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.parentId, categoryId))
        .limit(1);
      if (child) throw new BadRequestException('A Category with children cannot have a parent');
    }
    if (willBeArchived && !current.archived) {
      const [activeChild] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.parentId, categoryId), isNull(categories.archivedAt)))
        .limit(1);
      if (activeChild) throw new ConflictException('Archive the children first');
    }
    if (!willBeArchived && nextParentId !== null) {
      const [parent] = await this.select(eq(categories.id, nextParentId));
      if (parent?.archived) throw new ConflictException('The parent Category is archived');
    }

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
