import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { categoryKinds, recurrenceFrequencies, transactionTypes } from '@daric/core';
import { id, timestamps, version } from './columns';
import { users } from './identity';
import { accounts } from './money';
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

export const transactionType = pgEnum('transaction_type', [...transactionTypes, 'TRANSFER']);

/**
 * An Income or Expense on an Account, or a Transfer from it to another
 * (`to_account_id`, `to_amount`). Composite foreign keys keep its Accounts and
 * Category in its own Workspace, and its Category of its own kind. Deleted
 * softly (`deleted_at`) so offline clients replaying a create cannot bring it back.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: transactionType('type').notNull(),
    accountId: uuid('account_id').notNull(),
    categoryId: uuid('category_id'),
    /** The kind a Category must have for this type; null for a Transfer. */
    categoryKind: categoryKind('category_kind').generatedAlwaysAs(
      sql`CASE type WHEN 'INCOME' THEN 'INCOME'::category_kind WHEN 'EXPENSE' THEN 'EXPENSE'::category_kind END`,
    ),
    /** Positive, in the Account's currency's minor unit; `type` says which way it went. */
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    /** The day it happened, on the Gregorian calendar; the Workspace Calendar decides its Period. */
    /** A Transfer's destination Account; null otherwise. */
    toAccountId: uuid('to_account_id'),
    /** What a Transfer puts into its destination Account, in that Account's currency; null otherwise. */
    toAmount: bigint('to_amount', { mode: 'bigint' }),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    unique('transactions_id_workspace_id_key').on(t.id, t.workspaceId),
    foreignKey({
      name: 'transactions_account_fk',
      columns: [t.accountId, t.workspaceId],
      foreignColumns: [accounts.id, accounts.workspaceId],
    }),
    foreignKey({
      name: 'transactions_to_account_fk',
      columns: [t.toAccountId, t.workspaceId],
      foreignColumns: [accounts.id, accounts.workspaceId],
    }),
    foreignKey({
      name: 'transactions_category_fk',
      columns: [t.categoryId, t.workspaceId, t.categoryKind],
      foreignColumns: [categories.id, categories.workspaceId, categories.kind],
    }),
    check('transactions_amount_check', sql`${t.amount} > 0`),
    check(
      'transactions_category_check',
      sql`${t.type} = 'TRANSFER' OR ${t.categoryId} IS NOT NULL`,
    ),
    // A Transfer has a destination and no Category; Income and Expense the other way round.
    check(
      'transactions_transfer_check',
      sql`CASE WHEN ${t.type} = 'TRANSFER' THEN ${t.toAccountId} IS NOT NULL AND ${t.toAmount} IS NOT NULL AND ${t.categoryId} IS NULL ELSE ${t.toAccountId} IS NULL AND ${t.toAmount} IS NULL END`,
    ),
    check('transactions_to_amount_check', sql`${t.toAmount} > 0`),
    check('transactions_to_account_check', sql`${t.toAccountId} <> ${t.accountId}`),
    check('transactions_note_check', sql`char_length(${t.note}) <= 1000`),
    index('transactions_workspace_id_occurred_on_idx').on(t.workspaceId, t.occurredOn),
    index('transactions_account_id_idx').on(t.accountId),
    index('transactions_to_account_id_idx').on(t.toAccountId),
    index('transactions_category_id_idx').on(t.categoryId),
  ],
);

/**
 * A free classification of Transactions, independent of Category; a controllable one
 * marks spending the user could reduce. Names are unique in a Workspace,
 * ignoring case. Never deleted, only archived.
 */
export const labels = pgTable(
  'labels',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    controllable: boolean('controllable').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    unique('labels_id_workspace_id_key').on(t.id, t.workspaceId),
    uniqueIndex('labels_workspace_id_name_key').on(t.workspaceId, sql`lower(${t.name})`),
  ],
);

/**
 * Which Labels a Transaction carries. Composite foreign keys keep both in the
 * same Workspace; detaching deletes the row.
 */
export const transactionLabels = pgTable(
  'transaction_labels',
  {
    transactionId: uuid('transaction_id').notNull(),
    labelId: uuid('label_id').notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'transaction_labels_pkey', columns: [t.transactionId, t.labelId] }),
    foreignKey({
      name: 'transaction_labels_transaction_fk',
      columns: [t.transactionId, t.workspaceId],
      foreignColumns: [transactions.id, transactions.workspaceId],
    }),
    foreignKey({
      name: 'transaction_labels_label_fk',
      columns: [t.labelId, t.workspaceId],
      foreignColumns: [labels.id, labels.workspaceId],
    }),
    index('transaction_labels_label_id_idx').on(t.labelId),
  ],
);

export const recurrenceFrequency = pgEnum('recurrence_frequency', recurrenceFrequencies);

/**
 * A template that makes Income or Expense Transactions on a schedule (rent,
 * salary, subscriptions). Its `type` is a Category kind, so the composite
 * foreign key keeps its Category of its own type and, with its Account, in
 * its own Workspace. Never deleted, only archived: archived, nothing of it
 * comes due.
 */
export const recurringRules = pgTable(
  'recurring_rules',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: categoryKind('type').notNull(),
    accountId: uuid('account_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    /** Positive, in the Account's currency's minor unit. */
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    frequency: recurrenceFrequency('frequency').notNull(),
    interval: integer('interval').notNull().default(1),
    /** The first occurrence, a Gregorian day; its day in the Workspace Calendar repeats. */
    startOn: date('start_on', { mode: 'string' }).notNull(),
    endOn: date('end_on', { mode: 'string' }),
    /**
     * Occurrences before this day never come due: set to the next day when the
     * schedule changes, so a new schedule does not bring back days already handled.
     */
    dueFrom: date('due_from', { mode: 'string' }),
    autoPost: boolean('auto_post').notNull().default(false),
    /** Who made it; Transactions it auto-posts are theirs. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    unique('recurring_rules_id_workspace_id_key').on(t.id, t.workspaceId),
    foreignKey({
      name: 'recurring_rules_account_fk',
      columns: [t.accountId, t.workspaceId],
      foreignColumns: [accounts.id, accounts.workspaceId],
    }),
    foreignKey({
      name: 'recurring_rules_category_fk',
      columns: [t.categoryId, t.workspaceId, t.type],
      foreignColumns: [categories.id, categories.workspaceId, categories.kind],
    }),
    check('recurring_rules_amount_check', sql`${t.amount} > 0`),
    check('recurring_rules_interval_check', sql`${t.interval} BETWEEN 1 AND 52`),
    check('recurring_rules_end_on_check', sql`${t.endOn} >= ${t.startOn}`),
    check('recurring_rules_name_check', sql`char_length(${t.name}) <= 100`),
    index('recurring_rules_workspace_id_idx').on(t.workspaceId),
    index('recurring_rules_account_id_idx').on(t.accountId),
    index('recurring_rules_category_id_idx').on(t.categoryId),
  ],
);

export const occurrenceStatus = pgEnum('occurrence_status', ['CONFIRMED', 'SKIPPED']);

/**
 * An occurrence of a Recurring Rule that was handled: confirmed with the
 * Transaction it made, or skipped. One per rule and day, so an occurrence is
 * handled once; those of the rule's schedule up to today with no row here
 * are its Due Occurrences.
 */
export const recurringOccurrences = pgTable(
  'recurring_occurrences',
  {
    ruleId: uuid('rule_id').notNull(),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    status: occurrenceStatus('status').notNull(),
    /** The Transaction a confirmation made; null for a skipped occurrence. */
    transactionId: uuid('transaction_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'recurring_occurrences_pkey', columns: [t.ruleId, t.dueOn] }),
    foreignKey({
      name: 'recurring_occurrences_rule_fk',
      columns: [t.ruleId, t.workspaceId],
      foreignColumns: [recurringRules.id, recurringRules.workspaceId],
    }),
    foreignKey({
      name: 'recurring_occurrences_transaction_fk',
      columns: [t.transactionId, t.workspaceId],
      foreignColumns: [transactions.id, transactions.workspaceId],
    }),
    unique('recurring_occurrences_transaction_id_key').on(t.transactionId),
    check(
      'recurring_occurrences_transaction_check',
      sql`(${t.status} = 'CONFIRMED') = (${t.transactionId} IS NOT NULL)`,
    ),
  ],
);
