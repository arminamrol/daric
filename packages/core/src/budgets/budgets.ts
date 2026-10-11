import { calendarDateOf, periodDays } from '../calendar';
import type { CalendarSystem, IsoDay, Period } from '../calendar';
import type { CategoryNode } from '../categories';
import type { AnyTransactionType } from '../transactions';

/** How long a Budget's Period is: a month or a year of the Workspace Calendar. */
export const budgetPeriods = ['MONTHLY', 'YEARLY'] as const;
export type BudgetPeriod = (typeof budgetPeriods)[number];

/** From this share of the limit spent, a Budget warns. */
export const BUDGET_WARNING_PERCENT = 80;

/** Below the warning, at or above it up to the limit, or over the limit. */
export const budgetStates = ['ok', 'warning', 'over'] as const;
export type BudgetState = (typeof budgetStates)[number];

export interface BudgetProgress {
  readonly spent: bigint;
  /** What is left of the limit; negative once overspent. */
  readonly remaining: bigint;
  /** Whole percent of the limit spent, rounded down; above 100 once overspent. */
  readonly percent: number;
  readonly state: BudgetState;
}

/** How far `spent` has gone into a positive `limit`. No rollover: each Period starts afresh. */
export function budgetProgress(limit: bigint, spent: bigint): BudgetProgress {
  if (limit <= 0n) throw new RangeError('A Budget limit must be positive');
  const percent = Number((spent * 100n) / limit);
  const state: BudgetState =
    spent > limit
      ? 'over'
      : spent * 100n >= limit * BigInt(BUDGET_WARNING_PERCENT)
        ? 'warning'
        : 'ok';
  return { spent, remaining: limit - spent, percent, state };
}

/** The month or year of the Workspace Calendar holding `day` that a Budget of `period` covers. */
export function budgetPeriodOf(
  period: BudgetPeriod,
  day: IsoDay,
  calendar: CalendarSystem,
): Period {
  const { year, month } = calendarDateOf(day, calendar);
  return period === 'MONTHLY' ? { kind: 'month', year, month } : { kind: 'year', year };
}

/** What `budgetExpenses` needs of a Transaction; a Transfer has no Category. */
export interface BudgetTransaction {
  readonly type: AnyTransactionType;
  readonly categoryId?: string | null;
  readonly amount: bigint;
  readonly occurredOn: IsoDay;
  readonly labelIds: readonly string[];
}

/** Which Budget and Period `budgetExpenses` and `budgetSpent` look at. */
export interface BudgetScope {
  readonly budget: { readonly categoryId: string; readonly labelId: string | null };
  readonly period: Period;
  readonly calendar: CalendarSystem;
  /** The Workspace's Categories, so a parent can include its children. */
  readonly categories: readonly CategoryNode[];
}

/**
 * The Expenses a Budget counts in its Period: those of its Category or, for a
 * parent, of its children, carrying its Label when it has one. Income and
 * Transfers never count.
 */
export function budgetExpenses<T extends BudgetTransaction>(
  scope: BudgetScope,
  transactions: readonly T[],
): T[] {
  const { budget } = scope;
  const categoryIds = new Set([
    budget.categoryId,
    ...scope.categories.filter((c) => c.parentId === budget.categoryId).map((c) => c.id),
  ]);
  const { from, until } = periodDays(scope.period, scope.calendar);
  return transactions.filter(
    (t) =>
      t.type === 'EXPENSE' &&
      !!t.categoryId &&
      categoryIds.has(t.categoryId) &&
      t.occurredOn >= from &&
      t.occurredOn < until &&
      (budget.labelId === null || t.labelIds.includes(budget.labelId)),
  );
}

/**
 * What a Budget's Expenses add up to in its Period. Amounts are added as
 * given, so pass only Transactions in the Budget's currency.
 */
export function budgetSpent(
  scope: BudgetScope,
  transactions: readonly BudgetTransaction[],
): bigint {
  return budgetExpenses(scope, transactions).reduce((sum, t) => sum + t.amount, 0n);
}
