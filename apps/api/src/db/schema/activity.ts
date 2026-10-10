import {
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { categoryKinds } from '@daric/core';
import { id, timestamps, version } from './columns';
import { workspaces } from './tenancy';

export const categoryKind = pgEnum('category_kind', categoryKinds);

/**
 * An Income or Expense Category, at most one level deep. The composite foreign
 * key keeps a child in its parent's Workspace and kind; the service checks the
 * parent is top-level. Never deleted, only archived.
 */
export const categories = pgTable(
  'categories',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: categoryKind('kind').notNull(),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    /** One of core's `categoryIcons`. */
    icon: text('icon').notNull(),
    /** One of core's `categoryColors`. */
    color: text('color').notNull(),
    /** Order among siblings. */
    position: integer('position').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    unique('categories_id_workspace_id_kind_key').on(t.id, t.workspaceId, t.kind),
    foreignKey({
      name: 'categories_parent_fk',
      columns: [t.parentId, t.workspaceId, t.kind],
      foreignColumns: [t.id, t.workspaceId, t.kind],
    }),
    index('categories_workspace_id_idx').on(t.workspaceId),
    index('categories_parent_id_idx').on(t.parentId),
  ],
);
