import { addDays, monthPeriodOfDay, periodDays, previousPeriod } from '../calendar';
import type { CalendarSystem, IsoDay, MonthPeriod, Period } from '../calendar';
import type { CategoryNode } from '../categories';
import { divRound } from '../money';
import type { Currency, Money } from '../money';
import { RateConverter, rateDayOf } from '../rates';
import type { ExchangeRate } from '../rates';
import type { AnyTransactionType, TransactionType } from '../transactions';

/** What a report needs of a Transaction; a Transfer has no Category and never counts. */
export interface ReportTransaction {
  readonly type: AnyTransactionType;
  readonly categoryId: string | null;
  readonly amount: Money;
  readonly occurredOn: IsoDay;
  readonly labelIds: readonly string[];
}

export interface ReportInput<R extends ExchangeRate = ExchangeRate> {
  readonly calendar: CalendarSystem;
  /** The month or year of the Workspace Calendar reported on. */
  readonly period: Period;
  /** Today in the Workspace's timezone: a running Period converts at today's rates. */
  readonly today: IsoDay;
  readonly base: Currency;
  readonly rates: readonly R[];
  readonly transactions: readonly ReportTransaction[];
  /** The Workspace's Categories, archived ones included, so a parent can include its children. */
  readonly categories: readonly CategoryNode[];
}

/** A child Category's part of its parent's line. */
export interface CategoryChildLine {
  readonly categoryId: string;
  readonly total: bigint;
  /** Whole percent of its type's total, rounded half up. */
  readonly share: number;
}

/** A top-level Category's total in a Period: its own Transactions and its children's. */
export interface CategoryLine {
  readonly categoryId: string;
  readonly type: TransactionType;
  readonly total: bigint;
  /** Of `total`, what was recorded on the parent itself. */
  readonly own: bigint;
  /** Whole percent of its type's total, rounded half up. */
  readonly share: number;
  /** Largest first; only children with Transactions in the Period. */
  readonly children: CategoryChildLine[];
}

/** What carried a Label in a Period; a Transaction with several Labels counts under each. */
export interface LabelLine {
  readonly labelId: string;
  readonly income: bigint;
  readonly expense: bigint;
  /** Whole percent of the Period's Income and Expense, rounded half up. */
  readonly incomeShare: number;
  readonly expenseShare: number;
}

export interface PeriodReport<R extends ExchangeRate = ExchangeRate> {
  readonly period: Period;
  /** The Period's first and last day. */
  readonly from: IsoDay;
  readonly to: IsoDay;
  /** The day every Amount was converted on: the Period's last day, or today while it runs. */
  readonly rateDay: IsoDay;
  readonly income: bigint;
  readonly expense: bigint;
  /** Income minus Expense; negative when more went out than came in. */
  readonly net: bigint;
  /** Income lines, then Expense, each largest first. */
  readonly categories: CategoryLine[];
  /** Labels carried in the Period, most Expense first; their totals overlap. */
  readonly labels: LabelLine[];
  /** What carried no Label. */
  readonly unlabeled: { readonly income: bigint; readonly expense: bigint };
  readonly ratesUsed: R[];
  /** Currency codes left out for want of a rate on `rateDay`. */
  readonly missing: string[];
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** An Income or Expense Transaction, which always has a Category. */
type IncomeOrExpense = ReportTransaction & {
  readonly type: TransactionType;
  readonly categoryId: string;
};

/** One Category's total of one type, in the Base Currency. */
interface CategoryTotal {
  readonly type: TransactionType;
  readonly categoryId: string;
  readonly total: bigint;
}

/** Income and Expense Transactions in `[from, until)`; Transfers never count. */
function incomeAndExpenseIn(
  transactions: readonly ReportTransaction[],
  from: IsoDay,
  until: IsoDay,
): IncomeOrExpense[] {
  return transactions.filter(
    (t): t is IncomeOrExpense =>
      t.type !== 'TRANSFER' &&
      t.categoryId !== null &&
      t.occurredOn >= from &&
      t.occurredOn < until,
  );
}

/** Whole percent `part` is of `whole`, rounded half up; 0 of nothing. */
export function shareOf(part: bigint, whole: bigint): number {
  return whole === 0n ? 0 : Number(divRound(part * 100n, whole));
}

/** Largest first, then by id so equal totals keep one order. */
function byTotal(
  a: { total: bigint; categoryId: string },
  b: { total: bigint; categoryId: string },
): number {
  if (a.total !== b.total) return a.total > b.total ? -1 : 1;
  return a.categoryId.localeCompare(b.categoryId);
}

/**
 * Each Category's total in the Base Currency, converted once per Category (the
 * buckets the breakdown shows) on `day`, so the type totals are the sums of its
 * lines, as the Projection does.
 */
function totalsByCategory(
  transactions: readonly IncomeOrExpense[],
  converter: RateConverter<ExchangeRate>,
  day: IsoDay,
): CategoryTotal[] {
  const amounts = new Map<string, Money[]>();
  const keys = new Map<string, { type: TransactionType; categoryId: string }>();
  for (const t of transactions) {
    const k = `${t.type}|${t.categoryId}`;
    keys.set(k, { type: t.type, categoryId: t.categoryId });
    push(amounts, k, t.amount);
  }
  return [...keys].map(([k, key]) => ({
    ...key,
    total: converter.convert(amounts.get(k) ?? [], day),
  }));
}

/** One type's total: the sum of its Categories'. */
function typeTotal(totals: readonly CategoryTotal[], type: TransactionType): bigint {
  return totals.filter((c) => c.type === type).reduce((sum, c) => sum + c.total, 0n);
}

/**
 * Top-level lines with their children folded in. A Category missing from
 * `categories` stands on its own line.
 */
function categoryLines(
  totals: readonly CategoryTotal[],
  categories: readonly CategoryNode[],
): CategoryLine[] {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const tops = new Map<
    string,
    {
      type: TransactionType;
      categoryId: string;
      own: bigint;
      children: { categoryId: string; total: bigint }[];
    }
  >();
  for (const line of totals) {
    const parentId = parentOf.get(line.categoryId) ?? null;
    const topId = parentId ?? line.categoryId;
    const k = `${line.type}|${topId}`;
    let top = tops.get(k);
    if (!top) tops.set(k, (top = { type: line.type, categoryId: topId, own: 0n, children: [] }));
    if (parentId === null) top.own += line.total;
    else top.children.push({ categoryId: line.categoryId, total: line.total });
  }
  return [...tops.values()]
    .map((top) => {
      const whole = typeTotal(totals, top.type);
      const total = top.children.reduce((sum, c) => sum + c.total, top.own);
      return {
        categoryId: top.categoryId,
        type: top.type,
        total,
        own: top.own,
        share: shareOf(total, whole),
        children: top.children.sort(byTotal).map((c) => ({ ...c, share: shareOf(c.total, whole) })),
      };
    })
    .sort((a, b) => (a.type !== b.type ? (a.type === 'INCOME' ? -1 : 1) : byTotal(a, b)));
}

interface IncomeAndExpense {
  readonly income: bigint;
  readonly expense: bigint;
}

/** Larger first; 0 when equal. */
function descending(a: bigint, b: bigint): number {
  return a === b ? 0 : a > b ? -1 : 1;
}

/**
 * Income and Expense per Label, and of what carried none, each converted once
 * on `day`. A Transaction with several Labels counts under each.
 */
function totalsByLabel(
  transactions: readonly IncomeOrExpense[],
  converter: RateConverter<ExchangeRate>,
  day: IsoDay,
): { byLabel: Map<string, IncomeAndExpense>; unlabeled: IncomeAndExpense } {
  type Bucket = Record<TransactionType, Money[]>;
  const bucket = (): Bucket => ({ INCOME: [], EXPENSE: [] });
  const byLabel = new Map<string, Bucket>();
  const unlabeled = bucket();
  for (const t of transactions) {
    if (t.labelIds.length === 0) unlabeled[t.type].push(t.amount);
    for (const labelId of t.labelIds) {
      let amounts = byLabel.get(labelId);
      if (!amounts) byLabel.set(labelId, (amounts = bucket()));
      amounts[t.type].push(t.amount);
    }
  }
  const convert = (amounts: Bucket): IncomeAndExpense => ({
    income: converter.convert(amounts.INCOME, day),
    expense: converter.convert(amounts.EXPENSE, day),
  });
  return {
    byLabel: new Map([...byLabel].map(([labelId, amounts]) => [labelId, convert(amounts)])),
    unlabeled: convert(unlabeled),
  };
}

/**
 * A Period's Income and Expense in the Base Currency, converted at each
 * currency's rate on the Period's last day (today while it runs). A currency
 * with no rate then is left out and listed as missing, never guessed.
 */
export function periodReport<R extends ExchangeRate>(input: ReportInput<R>): PeriodReport<R> {
  const { calendar, period, today } = input;
  const { from, until } = periodDays(period, calendar);
  const rateDay = rateDayOf(period, calendar, today);
  const converter = new RateConverter(input.base, input.rates);
  const inPeriod = incomeAndExpenseIn(input.transactions, from, until);
  const totals = totalsByCategory(inPeriod, converter, rateDay);
  const { byLabel, unlabeled } = totalsByLabel(inPeriod, converter, rateDay);
  const income = typeTotal(totals, 'INCOME');
  const expense = typeTotal(totals, 'EXPENSE');
  const labels = [...byLabel]
    .map(([labelId, t]) => ({
      labelId,
      ...t,
      incomeShare: shareOf(t.income, income),
      expenseShare: shareOf(t.expense, expense),
    }))
    .sort(
      (a, b) =>
        descending(a.expense, b.expense) ||
        descending(a.income, b.income) ||
        a.labelId.localeCompare(b.labelId),
    );
  return {
    period,
    from,
    to: addDays(until, -1),
    rateDay,
    income,
    expense,
    net: income - expense,
    categories: categoryLines(totals, input.categories),
    labels,
    unlabeled,
    ratesUsed: [...converter.ratesUsed.values()],
    missing: [...converter.missing].sort(),
  };
}

/** How many months the trend looks back over. */
export const TREND_MONTHS = 12;

/**
 * The months the trend of `period` shows, oldest first: the twelve up to its
 * last month (a year's own months), leaving out those not yet started.
 */
export function trendMonths(
  period: Period,
  calendar: CalendarSystem,
  today: IsoDay,
): MonthPeriod[] {
  const thisMonth = monthPeriodOfDay(today, calendar);
  const months: MonthPeriod[] = [];
  let month: MonthPeriod =
    period.kind === 'month' ? period : { kind: 'month', year: period.year, month: 12 };
  for (let i = 0; i < TREND_MONTHS; i++, month = previousPeriod(month)) {
    const started =
      month.year < thisMonth.year ||
      (month.year === thisMonth.year && month.month <= thisMonth.month);
    if (started) months.unshift(month);
  }
  return months;
}

/** One month of the trend, in the Base Currency. */
export interface TrendPoint {
  readonly month: MonthPeriod;
  readonly income: bigint;
  readonly expense: bigint;
  readonly net: bigint;
  /** Currency codes this month left out for want of a rate. */
  readonly missing: string[];
}

export interface TrendInput<R extends ExchangeRate = ExchangeRate> extends Omit<
  ReportInput<R>,
  'period' | 'categories'
> {
  readonly months: readonly MonthPeriod[];
}

/**
 * Income and Expense of each month in the Base Currency, each converted at the
 * month's own rates (its last day's, or today's while it runs) and per
 * Category, as `periodReport` does, so a month's point matches its report.
 */
export function trendReport(input: TrendInput): TrendPoint[] {
  const { calendar, today } = input;
  return input.months.map((month) => {
    const { from, until } = periodDays(month, calendar);
    const converter = new RateConverter(input.base, input.rates);
    const totals = totalsByCategory(
      incomeAndExpenseIn(input.transactions, from, until),
      converter,
      rateDayOf(month, calendar, today),
    );
    const income = typeTotal(totals, 'INCOME');
    const expense = typeTotal(totals, 'EXPENSE');
    return {
      month,
      income,
      expense,
      net: income - expense,
      missing: [...converter.missing].sort(),
    };
  });
}
