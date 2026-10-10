import type { AccountClass } from '../accounts';
import { monthPeriodOfDay } from '../calendar';
import type { CalendarSystem, IsoDay, MonthPeriod } from '../calendar';
import { money } from '../money';
import type { Currency, Money } from '../money';

/** Income or Expense; Transfers come with their own rules. */
export const transactionTypes = ['INCOME', 'EXPENSE'] as const;
export type TransactionType = (typeof transactionTypes)[number];

/**
 * How much a Transaction of a positive `amount` changes its Account's balance.
 * A Liability's balance is what is owed, so an Expense paid from it (a card
 * purchase) raises it and Income paid into it lowers it.
 */
export function balanceEffect(
  transaction: { readonly type: TransactionType; readonly amount: bigint },
  accountClass: AccountClass,
): bigint {
  const inflow = transaction.type === 'INCOME' ? transaction.amount : -transaction.amount;
  return accountClass === 'ASSET' ? inflow : -inflow;
}

/** Income and Expense of one currency. */
export interface CurrencyTotals {
  readonly currency: Currency;
  readonly income: Money;
  readonly expense: Money;
}

export interface MonthGroup<T> {
  readonly period: MonthPeriod;
  readonly transactions: T[];
  /** One entry per currency, by currency code: Amounts in different currencies never add up. */
  readonly totals: CurrencyTotals[];
}

/**
 * Transactions grouped by month of the Workspace Calendar, newest month first;
 * within a month they keep the order given.
 */
export function groupByMonth<
  T extends {
    readonly type: TransactionType;
    readonly amount: bigint;
    readonly occurredOn: IsoDay;
  },
>(
  transactions: readonly T[],
  calendar: CalendarSystem,
  currencyOf: (transaction: T) => Currency,
): MonthGroup<T>[] {
  const groups = new Map<string, { period: MonthPeriod; transactions: T[] }>();
  for (const transaction of transactions) {
    const period = monthPeriodOfDay(transaction.occurredOn, calendar);
    const key = `${period.year}-${String(period.month).padStart(2, '0')}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { period, transactions: [] }));
    group.transactions.push(transaction);
  }
  return [...groups]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([, group]) => ({ ...group, totals: totalsOf(group.transactions, currencyOf) }));
}

function totalsOf<T extends { readonly type: TransactionType; readonly amount: bigint }>(
  transactions: readonly T[],
  currencyOf: (transaction: T) => Currency,
): CurrencyTotals[] {
  const byCode = new Map<string, { currency: Currency; income: bigint; expense: bigint }>();
  for (const transaction of transactions) {
    const currency = currencyOf(transaction);
    let total = byCode.get(currency.code);
    if (!total) byCode.set(currency.code, (total = { currency, income: 0n, expense: 0n }));
    if (transaction.type === 'INCOME') total.income += transaction.amount;
    else total.expense += transaction.amount;
  }
  return [...byCode.values()]
    .sort((a, b) => a.currency.code.localeCompare(b.currency.code))
    .map(({ currency, income, expense }) => ({
      currency,
      income: money(income, currency),
      expense: money(expense, currency),
    }));
}
