import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { accountClasses, accountTypes } from '@daric/core';
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
