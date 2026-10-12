import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  budgetPeriods,
  DEFAULT_TRAILING_MONTHS,
  MAX_TRAILING_MONTHS,
  plannedItemKinds,
  projectionModes,
} from '@daric/core';
import { categories, categoryKind, labels } from './activity';
import { id, timestamps, version } from './columns';
import { currencies } from './money';
import { workspaces } from './tenancy';

export const budgetPeriod = pgEnum('budget_period', budgetPeriods);
export const projectionMode = pgEnum('projection_mode', projectionModes);
export const plannedItemKind = pgEnum('planned_item_kind', plannedItemKinds);

/**
 * A spending limit for an Expense Category, optionally narrowed to one Label,
 * per month or year of the Workspace Calendar. Composite foreign keys keep its
 * Category (of kind Expense) and Label in its own Workspace. One Budget per
 * Category, Label and Period.
 */
export const budgets = pgTable(
  'budgets',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull(),
    /** Only Expense Categories have Budgets; the foreign key checks it through this column. */
    categoryKind: categoryKind('category_kind').generatedAlwaysAs(sql`'EXPENSE'::category_kind`),
    labelId: uuid('label_id'),
    period: budgetPeriod('period').notNull(),
    /** The limit per Period, positive, in `currency`'s minor unit. */
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    /** The Workspace's Base Currency when the Budget was made. */
    currency: text('currency')
      .notNull()
      .references(() => currencies.code),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    foreignKey({
      name: 'budgets_category_fk',
      columns: [t.categoryId, t.workspaceId, t.categoryKind],
      foreignColumns: [categories.id, categories.workspaceId, categories.kind],
    }),
    foreignKey({
      name: 'budgets_label_fk',
      columns: [t.labelId, t.workspaceId],
      foreignColumns: [labels.id, labels.workspaceId],
    }),
    unique('budgets_workspace_id_category_id_label_id_period_key')
      .on(t.workspaceId, t.categoryId, t.labelId, t.period)
      .nullsNotDistinct(),
    check('budgets_amount_check', sql`${t.amount} > 0`),
    index('budgets_category_id_idx').on(t.categoryId),
    index('budgets_label_id_idx').on(t.labelId),
  ],
);

/**
 * How a Workspace's Projection is worked out; at most one row per Workspace,
 * and a Workspace without one uses the defaults.
 */
export const projectionSettings = pgTable(
  'projection_settings',
  {
    workspaceId: uuid('workspace_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** N: how many closed months the Trailing Average looks back over. */
    trailingMonths: integer('trailing_months').notNull().default(DEFAULT_TRAILING_MONTHS),
    /** The mode the Projection is shown in unless another is asked for. */
    mode: projectionMode('mode').notNull().default('AUTOMATIC'),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    check(
      'projection_settings_trailing_months_check',
      sql`${t.trailingMonths} BETWEEN 1 AND ${sql.raw(String(MAX_TRAILING_MONTHS))}`,
    ),
  ],
);

/**
 * A user-entered expected amount for the Projection: Fixed Monthly, every
 * month on its start's day of the Workspace Calendar until its end, always in
 * a Category; or One-Off, once on its start day, optionally in a Category.
 * The composite foreign key keeps the Category in its Workspace and of the
 * item's type.
 */
export const plannedItems = pgTable(
  'planned_items',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: plannedItemKind('kind').notNull(),
    type: categoryKind('type').notNull(),
    categoryId: uuid('category_id'),
    /** Positive, per month for a Fixed Monthly item, in `currency`'s minor unit. */
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    /** The Workspace's Base Currency when the item was made. */
    currency: text('currency')
      .notNull()
      .references(() => currencies.code),
    /** A One-Off's day, or a Fixed Monthly's first; a Gregorian day. */
    startOn: date('start_on', { mode: 'string' }).notNull(),
    endOn: date('end_on', { mode: 'string' }),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    foreignKey({
      name: 'planned_items_category_fk',
      columns: [t.categoryId, t.workspaceId, t.type],
      foreignColumns: [categories.id, categories.workspaceId, categories.kind],
    }),
    check('planned_items_amount_check', sql`${t.amount} > 0`),
    check('planned_items_end_on_check', sql`${t.endOn} >= ${t.startOn}`),
    check('planned_items_name_check', sql`char_length(${t.name}) <= 100`),
    check(
      'planned_items_kind_check',
      sql`(${t.kind} = 'FIXED_MONTHLY' AND ${t.categoryId} IS NOT NULL) OR (${t.kind} = 'ONE_OFF' AND ${t.endOn} IS NULL)`,
    ),
    index('planned_items_workspace_id_idx').on(t.workspaceId),
    index('planned_items_category_id_idx').on(t.categoryId),
  ],
);
