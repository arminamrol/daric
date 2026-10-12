import { z } from 'zod';
import { accountClasses } from '../accounts';
import { amountSchema } from '../money';
import { rateUsedSchema } from './exchange-rate';
import { isoDaySchema } from './transaction';

/** Net Worth in one currency, unconverted. */
export const currencyNetWorthSchema = z.object({
  currency: z.string(),
  assets: amountSchema,
  liabilities: amountSchema,
  /** Assets minus Liabilities. */
  net: amountSchema,
});

/** What one Account counts for in Net Worth. */
export const netWorthAccountSchema = z.object({
  accountId: z.uuid(),
  name: z.string(),
  class: z.enum(accountClasses),
  currency: z.string(),
  archived: z.boolean(),
  /** Its latest Valuation on or before the day, else its balance; in its currency. */
  value: amountSchema,
  /** The day of the Valuation used, or null when `value` is the balance. */
  valuedOn: isoDaySchema.nullable(),
  /** `value` in the Base Currency, or null when its currency has no rate. */
  inBase: amountSchema.nullable(),
});

/**
 * Net Worth on a day (today in the Workspace's timezone): Asset Accounts minus
 * Liability Accounts in the Base Currency, each currency at its rate on the
 * day, with the totals per currency and per Account beneath.
 */
export const netWorthSchema = z.object({
  day: isoDaySchema,
  baseCurrency: z.string(),
  /** Assets minus Liabilities, leaving out currencies in `missing`. */
  total: amountSchema,
  assets: amountSchema,
  /** What is owed. */
  liabilities: amountSchema,
  /** By currency code. */
  byCurrency: z.array(currencyNetWorthSchema),
  /** Every Account, archived ones included, in the order Accounts are listed. */
  accounts: z.array(netWorthAccountSchema),
  ratesUsed: z.array(rateUsedSchema),
  /** Currencies with something to convert but no rate on the day. */
  missing: z.array(z.string()),
});
export type NetWorthWire = z.input<typeof netWorthSchema>;
export type NetWorthReport = z.infer<typeof netWorthSchema>;

/** AUTO: taken at a Workspace-Calendar month end; MANUAL: asked for by a Member. */
export const snapshotKinds = ['AUTO', 'MANUAL'] as const;
export type SnapshotKind = (typeof snapshotKinds)[number];

/**
 * A Net Worth Snapshot in a history: its totals on `day`, in the Base Currency
 * of the time. An AUTO one is of a month's last day; a MANUAL one is today's
 * Net Worth as it was shown when it was taken.
 */
export const netWorthSnapshotSummarySchema = z.object({
  id: z.uuid(),
  kind: z.enum(snapshotKinds),
  day: isoDaySchema,
  takenAt: z.iso.datetime(),
  baseCurrency: z.string(),
  total: amountSchema,
  assets: amountSchema,
  liabilities: amountSchema,
  missing: z.array(z.string()),
});
export type NetWorthSnapshotSummaryWire = z.input<typeof netWorthSnapshotSummarySchema>;
export type NetWorthSnapshotSummary = z.infer<typeof netWorthSnapshotSummarySchema>;

/** Oldest first. */
export const netWorthHistorySchema = z.array(netWorthSnapshotSummarySchema);

/** A Net Worth Snapshot with the breakdown it stored. */
export const netWorthSnapshotSchema = netWorthSchema.extend({
  id: z.uuid(),
  kind: z.enum(snapshotKinds),
  takenAt: z.iso.datetime(),
});
export type NetWorthSnapshotWire = z.input<typeof netWorthSnapshotSchema>;
export type NetWorthSnapshot = z.infer<typeof netWorthSnapshotSchema>;
