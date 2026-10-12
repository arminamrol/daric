import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accountClasses, accountTypes, snapshotKinds } from '@daric/core';
import type { NetWorthWire } from '@daric/core';
import { id, timestamps, version } from './columns';
import { workspaces } from './tenancy';

/** Every currency Daric knows and how many decimals its minor unit has (ADR-0004). Seeded. */
export const currencies = pgTable(
  'currencies',
  {
    code: text('code').primaryKey(),
    minorUnits: smallint('minor_units').notNull(),
  },
  (t) => [check('currencies_minor_units_check', sql`${t.minorUnits} BETWEEN 0 AND 4`)],
);

export const accountType = pgEnum('account_type', accountTypes);
export const accountClass = pgEnum('account_class', accountClasses);

/** A place money is held or owed. Never deleted, only archived, so its history stays. */
export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: accountType('type').notNull(),
    class: accountClass('class').notNull(),
    currency: text('currency')
      .notNull()
      .references(() => currencies.code),
    /** In the currency's minor unit; for a Liability, what was owed. */
    openingBalance: bigint('opening_balance', { mode: 'bigint' }).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    // Lets Transactions reference an Account of their own Workspace only.
    unique('accounts_id_workspace_id_key').on(t.id, t.workspaceId),
    index('accounts_workspace_id_idx').on(t.workspaceId),
  ],
);

/**
 * An Exchange Rate: how many units of `base_currency` one unit of `currency` is
 * worth, from `effective_on` until the currency's next rate. It keeps the Base
 * Currency it was entered against, so changing the Workspace's Base Currency
 * leaves old rates out instead of reading them as rates into the new one.
 */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    currency: text('currency')
      .notNull()
      .references(() => currencies.code),
    baseCurrency: text('base_currency')
      .notNull()
      .references(() => currencies.code),
    rate: numeric('rate', { precision: 30, scale: 12 }).notNull(),
    effectiveOn: date('effective_on', { mode: 'string' }).notNull(),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    unique('exchange_rates_currency_day_key').on(
      t.workspaceId,
      t.baseCurrency,
      t.currency,
      t.effectiveOn,
    ),
    check('exchange_rates_rate_check', sql`${t.rate} > 0`),
    check('exchange_rates_currency_check', sql`${t.currency} <> ${t.baseCurrency}`),
  ],
);

/**
 * A Valuation: what an Account was worth on `valued_on`, in its currency's minor
 * unit. An Account's value is its latest Valuation, else its balance.
 */
export const accountValuations = pgTable(
  'account_valuations',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    valuedOn: date('valued_on', { mode: 'string' }).notNull(),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    unique('account_valuations_account_day_key').on(t.accountId, t.valuedOn),
    foreignKey({
      name: 'account_valuations_account_fk',
      columns: [t.accountId, t.workspaceId],
      foreignColumns: [accounts.id, accounts.workspaceId],
    }),
    check('account_valuations_amount_check', sql`${t.amount} >= 0`),
    index('account_valuations_workspace_id_idx').on(t.workspaceId),
  ],
);

export const snapshotKind = pgEnum('snapshot_kind', snapshotKinds);

/** What a Net Worth Snapshot keeps beside its totals, as the API returns it. */
export type SnapshotBreakdown = Pick<
  NetWorthWire,
  'byCurrency' | 'accounts' | 'ratesUsed' | 'missing'
>;

/**
 * A Net Worth Snapshot: Net Worth on `day` in the Base Currency of the time,
 * with its breakdown. Never changed once taken. At most one AUTO snapshot per
 * day, which is a month's last day, so the month-end job can run again safely.
 */
export const netWorthSnapshots = pgTable(
  'net_worth_snapshots',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: snapshotKind('kind').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    baseCurrency: text('base_currency')
      .notNull()
      .references(() => currencies.code),
    total: bigint('total', { mode: 'bigint' }).notNull(),
    assets: bigint('assets', { mode: 'bigint' }).notNull(),
    liabilities: bigint('liabilities', { mode: 'bigint' }).notNull(),
    breakdown: jsonb('breakdown').$type<SnapshotBreakdown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('net_worth_snapshots_auto_day_key')
      .on(t.workspaceId, t.day)
      .where(sql`${t.kind} = 'AUTO'`),
    index('net_worth_snapshots_workspace_id_day_idx').on(t.workspaceId, t.day),
  ],
);
