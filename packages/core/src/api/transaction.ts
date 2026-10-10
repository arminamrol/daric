import { z } from 'zod';
import { isIsoDay } from '../calendar';
import type { Period } from '../calendar';
import { amountSchema } from '../money';
import { transactionTypes } from '../transactions';

/** A day with no time of day, as `YYYY-MM-DD` on the Gregorian calendar. */
export const isoDaySchema = z
  .string()
  .refine(isIsoDay, { message: 'Expected a day as YYYY-MM-DD' });

/** A Transaction as the API returns it; its Amount is in its Account's currency. */
export const transactionSchema = z.object({
  id: z.uuid(),
  type: z.enum(transactionTypes),
  accountId: z.uuid(),
  /** An Income Category for Income, an Expense Category for Expense. */
  categoryId: z.uuid(),
  /** Always positive; the type says which way the money went. */
  amount: amountSchema,
  /** The day it happened; the Workspace Calendar decides its Period. */
  occurredOn: isoDaySchema,
  note: z.string().nullable(),
  /** The User who recorded it, or null once their account is gone. */
  createdBy: z.uuid().nullable(),
  /** Bumped on every change; edits must name the version they started from. */
  version: z.number().int(),
});
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionWire = z.input<typeof transactionSchema>;
export const transactionListSchema = z.array(transactionSchema);

const positiveAmountSchema = amountSchema.refine((amount) => amount > 0n, {
  message: 'An Amount must be positive',
});

/**
 * Records an Income or Expense. A client may make the id itself (a UUIDv7) so
 * that sending the same Transaction twice records it once (ADR-0005).
 */
export const createTransactionInputSchema = z.strictObject({
  id: z.uuidv7().exactOptional(),
  type: z.enum(transactionTypes),
  accountId: z.uuid(),
  categoryId: z.uuid(),
  amount: positiveAmountSchema,
  occurredOn: isoDaySchema,
  note: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((note) => note || null),
});
export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;

// Year 0 does not exist on either calendar.
const PERIOD_PARAM = /^(?!0000)(\d{4})(?:-(0[1-9]|1[0-2]))?$/;

/** A Period as a query parameter: `1405-07` for a month, `1405` for a year. */
export function periodParam(period: Period): string {
  return period.kind === 'month'
    ? `${period.year}-${String(period.month).padStart(2, '0')}`
    : String(period.year);
}

const periodParamSchema = z.string().transform((value, ctx): Period => {
  const match = PERIOD_PARAM.exec(value);
  if (!match) {
    ctx.addIssue({ code: 'custom', message: 'Expected a period as YYYY or YYYY-MM' });
    return z.NEVER;
  }
  const year = Number(match[1]);
  return match[2] ? { kind: 'month', year, month: Number(match[2]) } : { kind: 'year', year };
});

/**
 * Filters for listing Transactions. A Period is of the Workspace Calendar; a
 * parent Category includes its children.
 */
export const listTransactionsQuerySchema = z.object({
  period: periodParamSchema.exactOptional(),
  accountId: z.uuid().exactOptional(),
  categoryId: z.uuid().exactOptional(),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
