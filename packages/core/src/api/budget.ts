import { z } from 'zod';
import { budgetPeriods, budgetStates } from '../budgets';
import { amountSchema } from '../money';
import {
  idSchema,
  monthParamSchema,
  notEmpty,
  periodParamSchema,
  positiveAmountSchema,
} from './shared';

/** How a Budget stands in one of its Periods. */
export const budgetProgressSchema = z.object({
  /** The month (`1405-07`) or year (`1405`) of the Workspace Calendar this is for. */
  period: periodParamSchema,
  /** Expenses counted so far, in the Budget's currency. */
  spent: amountSchema,
  /** What is left of the limit; negative once overspent. */
  remaining: amountSchema,
  /** Whole percent of the limit spent, rounded down; above 100 once overspent. */
  percent: z.number().int(),
  /** `warning` from 80% up to the limit, `over` above it. */
  state: z.enum(budgetStates),
  /**
   * The Exchange Rates Expenses in other currencies were converted at: each
   * currency's rate on the Period's last day, or today while it runs. Only a
   * Budget in the current Base Currency converts.
   */
  ratesUsed: z.array(z.object({ currency: z.string(), rate: z.string(), effectiveOn: z.string() })),
  /**
   * Expenses that would count but are on Accounts of another currency with no
   * rate to convert them; they are left out of `spent`.
   */
  otherCurrencyExpenses: z.number().int(),
});
export type BudgetProgressWire = z.infer<typeof budgetProgressSchema>;

/** A Budget as the API returns it, with its progress in the Period asked for. */
export const budgetSchema = z.object({
  id: z.uuid(),
  /** An Expense Category; a parent includes its children. */
  categoryId: z.uuid(),
  /** When set, only Expenses carrying this Label count. */
  labelId: z.uuid().nullable(),
  period: z.enum(budgetPeriods),
  /** The limit per Period, in `currency`. */
  amount: amountSchema,
  /** The Workspace's Base Currency when the Budget was made. */
  currency: z.string(),
  version: z.number().int(),
  progress: budgetProgressSchema,
});
export type Budget = z.infer<typeof budgetSchema>;
export type BudgetWire = z.input<typeof budgetSchema>;
export const budgetListSchema = z.array(budgetSchema);

/**
 * Sets a limit on an active Expense Category, optionally narrowed to an active
 * Label, per month or year. The limit is in the Workspace's Base Currency.
 */
export const createBudgetInputSchema = z.strictObject({
  categoryId: idSchema,
  labelId: idSchema.nullable().default(null),
  period: z.enum(budgetPeriods),
  amount: positiveAmountSchema,
});
/** The Label may be left out for the whole Category. */
export type CreateBudgetInput = Omit<z.infer<typeof createBudgetInputSchema>, 'labelId'> & {
  labelId?: string | null;
};

/** What an Owner or Admin may change on a Budget; at least one per request. */
export const updateBudgetInputSchema = z
  .strictObject({
    categoryId: idSchema.exactOptional(),
    labelId: idSchema.nullable().exactOptional(),
    period: z.enum(budgetPeriods).exactOptional(),
    amount: positiveAmountSchema.exactOptional(),
  })
  .refine(...notEmpty);
export type UpdateBudgetInput = z.infer<typeof updateBudgetInputSchema>;

/**
 * Which month every Budget read or write shows progress for; yearly Budgets
 * show the year holding it. Defaults to the current month.
 */
export const progressMonthQuerySchema = z.object({
  month: monthParamSchema.exactOptional(),
});
export type ProgressMonthQuery = z.infer<typeof progressMonthQuerySchema>;
