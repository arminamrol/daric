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
