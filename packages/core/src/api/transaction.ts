import { z } from 'zod';
import { isIsoDay } from '../calendar';
import { amountSchema } from '../money';
import { periodParamSchema, positiveAmountSchema } from './shared';
import { transactionTypes } from '../transactions';

/** A day with no time of day, as `YYYY-MM-DD` on the Gregorian calendar. */
export const isoDaySchema = z
  .string()
  .refine(isIsoDay, { message: 'Expected a day as YYYY-MM-DD' });

const transactionFields = {
  id: z.uuid(),
  accountId: z.uuid(),
  /** Always positive, in its Account's currency; the type says which way the money went. */
  amount: amountSchema,
  /** The day it happened; the Workspace Calendar decides its Period. */
  occurredOn: isoDaySchema,
  note: z.string().nullable(),
  /** The User who recorded it, or null once their account is gone. */
  createdBy: z.uuid().nullable(),
  /** The Labels attached to it, archived ones included. */
  labelIds: z.array(z.uuid()),
  /** Bumped on every change; edits must name the version they started from. */
  version: z.number().int(),
};

/** An Income or Expense as the API returns it. */
export const incomeExpenseSchema = z.object({
  ...transactionFields,
  type: z.enum(transactionTypes),
  /** An Income Category for Income, an Expense Category for Expense. */
  categoryId: z.uuid(),
});
export type IncomeExpense = z.infer<typeof incomeExpenseSchema>;

/**
 * A Transfer as the API returns it: its Amount leaves its Account and its
 * destination Amount, in the destination Account's currency, arrives in the
 * other. Of one currency, the two Amounts are equal.
 */
export const transferSchema = z.object({
  ...transactionFields,
  type: z.literal('TRANSFER'),
  toAccountId: z.uuid(),
  toAmount: amountSchema,
});
export type Transfer = z.infer<typeof transferSchema>;

/** A Transaction as the API returns it: an Income, Expense or Transfer. */
export const transactionSchema = z.discriminatedUnion('type', [
  incomeExpenseSchema,
  transferSchema,
]);
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionWire = z.input<typeof transactionSchema>;
export const transactionListSchema = z.array(transactionSchema);

/** The most Labels one Transaction may carry. */
export const MAX_LABELS_PER_TRANSACTION = 20;

/** What a Transaction is made of, as a create or an edit gives it. */
const inputFields = {
  accountId: z.uuid(),
  amount: positiveAmountSchema,
  occurredOn: isoDaySchema,
  note: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((note) => note || null),
  /** Active Labels of the same Workspace, each once. */
  labelIds: z
    // Lowercase, as the database writes them, so ids compare as text.
    .array(z.uuid().transform((id) => id.toLowerCase()))
    .max(MAX_LABELS_PER_TRANSACTION)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Label ids must be distinct' })
    .default([]),
};

const createFields = { ...inputFields, id: z.uuidv7().exactOptional() };

const incomeExpenseFields = {
  type: z.enum(transactionTypes),
  categoryId: z.uuid(),
};

const transferFields = {
  type: z.literal('TRANSFER'),
  toAccountId: z.uuid(),
  /**
   * In the destination Account's currency. Required between currencies;
   * of one currency it may be left out and must otherwise equal `amount`.
   */
  toAmount: positiveAmountSchema.exactOptional(),
};

/** A Transfer's Accounts differ. */
function twoAccounts<T extends z.ZodType<{ accountId: string; toAccountId: string }>>(schema: T) {
  return schema.refine(
    (input) => input.accountId.toLowerCase() !== input.toAccountId.toLowerCase(),
    {
      message: 'A Transfer moves money between two different Accounts',
      path: ['toAccountId'],
    },
  );
}

const createIncomeExpenseInputSchema = z.strictObject({
  ...createFields,
  ...incomeExpenseFields,
});

const createTransferInputSchema = twoAccounts(
  z.strictObject({ ...createFields, ...transferFields }),
);

/**
 * Records an Income, Expense or Transfer. A client may make the id itself (a
 * UUIDv7) so that sending the same Transaction twice records it once (ADR-0005).
 */
export const createTransactionInputSchema = z.discriminatedUnion('type', [
  createIncomeExpenseInputSchema,
  createTransferInputSchema,
]);
export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;

const updateFields = {
  ...inputFields,
  /** Left out, the Labels stay as they are; given, they replace them. */
  labelIds: inputFields.labelIds.removeDefault().exactOptional(),
  /** The version the edit started from; a stale one is refused with the current copy. */
  version: z.number().int().positive(),
};

/**
 * Replaces a Transaction's fields, also switching it between Income, Expense
 * and Transfer. Archived Accounts, Categories and Labels it already names may stay.
 */
export const updateTransactionInputSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...updateFields, ...incomeExpenseFields }),
  twoAccounts(z.strictObject({ ...updateFields, ...transferFields })),
]);
export type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>;

/**
 * Filters for listing Transactions. A Period is of the Workspace Calendar; a
 * parent Category includes its children. All given filters must match.
 */
export const listTransactionsQuerySchema = z.object({
  period: periodParamSchema.exactOptional(),
  accountId: z.uuid().exactOptional(),
  categoryId: z.uuid().exactOptional(),
  labelId: z.uuid().exactOptional(),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
