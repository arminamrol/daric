import { z } from 'zod';
import { amountSchema } from '../money';
import { transactionTypes } from '../transactions';
import { rateUsedSchema } from './exchange-rate';
import { monthParamSchema, periodParamSchema } from './shared';
import { isoDaySchema } from './transaction';

const shareSchema = z.number().int();

/** A top-level Category's total in the Period, its children folded in. */
export const categoryReportLineSchema = z.object({
  categoryId: z.uuid(),
  type: z.enum(transactionTypes),
  total: amountSchema,
  /** Of the total, what was recorded on the parent itself. */
  own: amountSchema,
  /** Whole percent of its type's total. */
  share: shareSchema,
  /** Largest first; only children with Transactions in the Period. */
  children: z.array(z.object({ categoryId: z.uuid(), total: amountSchema, share: shareSchema })),
});

/** What carried a Label; a Transaction with several Labels counts under each. */
export const labelReportLineSchema = z.object({
  labelId: z.uuid(),
  income: amountSchema,
  expense: amountSchema,
  /** Whole percent of the Period's Income and Expense. */
  incomeShare: shareSchema,
  expenseShare: shareSchema,
});

/** One month of the trend, converted at that month's own rates. */
export const trendPointSchema = z.object({
  /** `1405-07`. */
  month: monthParamSchema,
  income: amountSchema,
  expense: amountSchema,
  net: amountSchema,
  /** Currencies this month left out for want of a rate. */
  missing: z.array(z.string()),
});

/**
 * Spending under Controllable Labels: the Period's total (a Transaction with
 * several counts once), its breakdown, monthly trend and average month, which
 * `controllableSavings` turns into what reducing it would save.
 */
export const controllableReportSchema = z.object({
  expense: amountSchema,
  /** Whole percent of the Period's Expense. */
  share: shareSchema,
  /** Most Expense first; their totals overlap. */
  labels: z.array(z.object({ labelId: z.uuid(), expense: amountSchema, share: shareSchema })),
  /** The trend's months, oldest first. */
  trend: z.array(z.object({ month: monthParamSchema, expense: amountSchema })),
  /** Over the trend's closed months from the first with any, or the running month while none has. */
  monthlyAverage: amountSchema,
  monthsAveraged: z.number().int().nonnegative(),
  /** Whether the average is the running month so far, no closed month having any. */
  averageRunning: z.boolean(),
});

/**
 * A Period's report in the Base Currency: Income, Expense and net, the
 * Category and Label breakdowns, and the Income and Expense of the twelve
 * months up to the Period's last month (those not yet started left out).
 * Transfers never count.
 */
export const reportSchema = z.object({
  /** `1405-07` for a month, `1405` for a year. */
  period: periodParamSchema,
  /** The Period's first and last day. */
  from: isoDaySchema,
  to: isoDaySchema,
  /** The day the Period's Amounts were converted on: its last day, or today while it runs. */
  rateDay: isoDaySchema,
  baseCurrency: z.string(),
  income: amountSchema,
  expense: amountSchema,
  /** Income minus Expense. */
  net: amountSchema,
  /** Income lines, then Expense, each largest first. */
  categories: z.array(categoryReportLineSchema),
  /** Most Expense first; their totals overlap. */
  labels: z.array(labelReportLineSchema),
  unlabeled: z.object({ income: amountSchema, expense: amountSchema }),
  ratesUsed: z.array(rateUsedSchema),
  /** Currencies with Amounts in the Period but no rate on `rateDay`; those Amounts are left out. */
  missing: z.array(z.string()),
  /** Oldest month first. */
  trend: z.array(trendPointSchema),
  controllable: controllableReportSchema,
});
export type ReportWire = z.input<typeof reportSchema>;
export type Report = z.infer<typeof reportSchema>;

/** Which Period to report on; the current month by default. */
export const reportQuerySchema = z.object({
  period: periodParamSchema.exactOptional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;
