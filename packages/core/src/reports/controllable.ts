import { periodDays } from '../calendar';
import type { MonthPeriod } from '../calendar';
import { divRound } from '../money';
import type { ExchangeRate } from '../rates';
import { periodReport, shareOf, trendReport } from './reports';
import type { ReportInput, ReportTransaction } from './reports';

/** The savings slider's starting point: what reducing controllable spending by 20% saves. */
export const DEFAULT_SAVINGS_PERCENT = 20;

export interface ControllableInput<R extends ExchangeRate = ExchangeRate> extends ReportInput<R> {
  /** The trend's months, oldest first (see `trendMonths`). */
  readonly months: readonly MonthPeriod[];
  /** The Workspace's Controllable Labels, archived ones included. */
  readonly controllableLabelIds: readonly string[];
}

/** What carried one Controllable Label in the Period. */
export interface ControllableLabelLine {
  readonly labelId: string;
  readonly expense: bigint;
  /** Whole percent of the controllable total, rounded half up; lines overlap. */
  readonly share: number;
}

export interface ControllablePoint {
  readonly month: MonthPeriod;
  readonly expense: bigint;
  /** Currency codes this month left out for want of a rate. */
  readonly missing: string[];
}

/** Spending under Controllable Labels, in the Base Currency. */
export interface ControllableSpending {
  /** The Period's Expenses carrying a Controllable Label, each counted once. */
  readonly expense: bigint;
  /** Whole percent of the Period's Expense, rounded half up. */
  readonly share: number;
  /** Most Expense first. */
  readonly labels: ControllableLabelLine[];
  /** Each trend month's controllable Expense, at that month's rates. */
  readonly trend: ControllablePoint[];
  /**
   * The average month of controllable Expense: over the trend's closed months
   * from the first with any, or the running month while none has.
   */
  readonly monthlyAverage: bigint;
  /** How many months `monthlyAverage` is over; 0 when there was nothing to average. */
  readonly monthsAveraged: number;
  /** Whether `monthlyAverage` is the running month so far, no closed month having any. */
  readonly averageRunning: boolean;
}

/** The trend months to average: closed ones from the first with spending, else the running one. */
function monthsToAverage(
  trend: readonly ControllablePoint[],
  input: ControllableInput,
): { months: ControllablePoint[]; running: boolean } {
  const closed = trend.filter(
    (point) => periodDays(point.month, input.calendar).until <= input.today,
  );
  const first = closed.findIndex((point) => point.expense !== 0n);
  if (first >= 0) return { months: closed.slice(first), running: false };
  const running = trend.filter((point) => !closed.includes(point) && point.expense !== 0n);
  return { months: running, running: running.length > 0 };
}

/**
 * The Period's spending under Controllable Labels, its share of all Expense,
 * the monthly trend and the average month. A Transaction carrying several
 * Controllable Labels counts once in the totals and under each Label in the
 * breakdown; converted as `periodReport` and `trendReport` do.
 */
export function controllableSpending<R extends ExchangeRate>(
  input: ControllableInput<R>,
): ControllableSpending {
  const ids = new Set(input.controllableLabelIds);
  const controllableTransactions = input.transactions.filter(
    (t): t is ReportTransaction =>
      t.type === 'EXPENSE' && t.labelIds.some((labelId) => ids.has(labelId)),
  );
  const whole = periodReport(input);
  const report = periodReport({ ...input, transactions: controllableTransactions });
  const trend = trendReport({ ...input, transactions: controllableTransactions }).map((point) => ({
    month: point.month,
    expense: point.expense,
    missing: point.missing,
  }));
  const { months: averaged, running } = monthsToAverage(trend, input);
  const sum = averaged.reduce((total, point) => total + point.expense, 0n);
  return {
    expense: report.expense,
    share: shareOf(report.expense, whole.expense),
    labels: report.labels
      .filter((line) => ids.has(line.labelId))
      .map((line) => ({
        labelId: line.labelId,
        expense: line.expense,
        share: shareOf(line.expense, report.expense),
      })),
    trend,
    monthlyAverage: averaged.length === 0 ? 0n : divRound(sum, BigInt(averaged.length)),
    monthsAveraged: averaged.length,
    averageRunning: running,
  };
}

/** What reducing controllable spending by a percent would save. */
export interface ControllableSavings {
  readonly monthly: bigint;
  /** Twelve months' worth, rounded once (so not always 12 × `monthly`). */
  readonly yearly: bigint;
}

/**
 * What reducing a month of controllable spending (`monthlyAverage`) by
 * `percent` (a whole number from 0 to 100) saves a month and a year.
 */
export function controllableSavings(monthlyAverage: bigint, percent: number): ControllableSavings {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`A savings percent is a whole number from 0 to 100, not ${percent}`);
  }
  const reduced = monthlyAverage * BigInt(percent);
  return { monthly: divRound(reduced, 100n), yearly: divRound(reduced * 12n, 100n) };
}
