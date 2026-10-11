import type { AccountClass } from '../accounts';
import { monthPeriodOfDay } from '../calendar';
import type { CalendarSystem, IsoDay, MonthPeriod } from '../calendar';
import { money } from '../money';
import type { Currency, Money } from '../money';

/** Income or Expense, which carry a Category; Transfers come with their own rules. */
export const transactionTypes = ['INCOME', 'EXPENSE'] as const;
export type TransactionType = (typeof transactionTypes)[number];

/** Every type a Transaction may have. */
export type AnyTransactionType = TransactionType | 'TRANSFER';

/** Money going into or out of an Account. */
export type Flow = 'IN' | 'OUT';

/**
 * How much a positive `amount` flowing into or out of an Account changes its
 * balance. A Liability's balance is what is owed, so money paid into it (a card
 * repayment) lowers it and money taken from it (a card purchase) raises it.
 */
export function flowEffect(flow: Flow, amount: bigint, accountClass: AccountClass): bigint {
  const inflow = flow === 'IN' ? amount : -amount;
  return accountClass === 'ASSET' ? inflow : -inflow;
}

/** What a Transaction moves, as far as balances are concerned. */
export type BalanceMove =
  | { readonly type: TransactionType; readonly accountId: string; readonly amount: bigint }
  | {
      readonly type: 'TRANSFER';
      readonly accountId: string;
      readonly amount: bigint;
      readonly toAccountId: string;
      readonly toAmount: bigint;
    };

/**
 * How much a Transaction changes `account`'s balance: Income flows in, Expense
 * out, and a Transfer takes its Amount out of its Account and puts its
 * destination Amount into the other. Zero for an Account it does not touch.
 */
export function balanceEffect(
  transaction: BalanceMove,
  account: { readonly id: string; readonly class: AccountClass },
): bigint {
  let effect = 0n;
  if (transaction.accountId === account.id) {
    const flow = transaction.type === 'INCOME' ? 'IN' : 'OUT';
    effect += flowEffect(flow, transaction.amount, account.class);
  }
  if (transaction.type === 'TRANSFER' && transaction.toAccountId === account.id) {
    effect += flowEffect('IN', transaction.toAmount, account.class);
  }
  return effect;
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
 * within a month they keep the order given. Transfers are listed but never
 * count as Income or Expense.
 */
export function groupByMonth<
  T extends {
    readonly type: AnyTransactionType;
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

function totalsOf<T extends { readonly type: AnyTransactionType; readonly amount: bigint }>(
  transactions: readonly T[],
  currencyOf: (transaction: T) => Currency,
): CurrencyTotals[] {
  const byCode = new Map<string, { currency: Currency; income: bigint; expense: bigint }>();
  for (const transaction of transactions) {
    if (transaction.type === 'TRANSFER') continue;
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
