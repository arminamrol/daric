import { addDays, calendarDateOf, daysInMonth, periodDays, previousPeriod } from '../calendar';
import type { CalendarSystem, IsoDay, MonthPeriod } from '../calendar';
import { divRound, money } from '../money';
import type { Currency, Money } from '../money';
import { rateDayOf, toBaseCurrency } from '../rates';
import type { ExchangeRate } from '../rates';
import { occurrencesBetween } from '../recurring';
import type { RecurrenceSchedule } from '../recurring';
import type { AnyTransactionType, TransactionType } from '../transactions';

/** How many closed months the Trailing Average looks back over by default, and at most. */
export const DEFAULT_TRAILING_MONTHS = 3;
export const MAX_TRAILING_MONTHS = 12;

/** What the Projection needs of a Transaction. */
export interface ProjectionTransaction {
  readonly type: AnyTransactionType;
  readonly categoryId: string | null;
  readonly amount: Money;
  readonly occurredOn: IsoDay;
  /** Made by confirming a Recurring Rule's occurrence: actual, but never variable. */
  readonly recurring: boolean;
}

/** An active Recurring Rule; its Amount is in its Account's currency. */
export interface ProjectionRule extends RecurrenceSchedule {
  readonly id: string;
  readonly name: string;
  readonly type: TransactionType;
  readonly categoryId: string;
  readonly amount: Money;
}

export interface ProjectionInput<R extends ExchangeRate = ExchangeRate> {
  readonly calendar: CalendarSystem;
  /** Today in the Workspace's timezone. */
  readonly today: IsoDay;
  /** N: how many closed months the Trailing Average looks back over. */
  readonly trailingMonths: number;
  readonly base: Currency;
  readonly rates: readonly R[];
  readonly transactions: readonly ProjectionTransaction[];
  readonly rules: readonly ProjectionRule[];
  /**
   * The day of the Workspace's first Transaction, or null when it has none.
   * Window months before the one holding it have no history to average.
   */
  readonly historyFrom: IsoDay | null;
}

/** One type's or one Category's figures, in the Base Currency. */
export interface ProjectionFigures {
  /** A: what happened from the start of the year up to and including today. */
  readonly actual: bigint;
  /** V: the Trailing Average of variable amounts per month, rounded for showing. */
  readonly average: bigint;
  /** V × the months left (`rem`), rounded once. */
  readonly variable: bigint;
  /** R: what Recurring Rules will bring after today up to the year end. */
  readonly recurring: bigint;
  /** P = A + round(V × rem) + R. */
  readonly projected: bigint;
}

export interface CategoryProjection extends ProjectionFigures {
  readonly categoryId: string;
  readonly type: TransactionType;
}

/** A Recurring Rule's part in the Projection. */
export interface RecurringAssumption {
  readonly ruleId: string;
  readonly name: string;
  readonly type: TransactionType;
  readonly categoryId: string;
  /** Its occurrences after today up to the year end. */
  readonly occurrences: IsoDay[];
  /** Their Amounts added up, in the Base Currency. */
  readonly total: bigint;
}

export type ProjectionWarning =
  /** The window reaches back before the first Transaction; fewer months were averaged. */
  | { readonly kind: 'short_history'; readonly monthsUsed: number; readonly monthsWanted: number }
  /** No closed month has history: the Trailing Average is zero. */
  | { readonly kind: 'no_history'; readonly monthsWanted: number }
  /** Amounts in these currencies had no rate and were left out. */
  | { readonly kind: 'missing_rates'; readonly currencies: string[] };

export interface Projection<R extends ExchangeRate = ExchangeRate> {
  /** The Workspace-Calendar year projected. */
  readonly year: number;
  readonly today: IsoDay;
  /** The year's last day. */
  readonly yearEnd: IsoDay;
  /** rem = fullMonths + daysLeftInMonth / daysInMonth. */
  readonly remaining: {
    readonly daysLeftInMonth: number;
    readonly daysInMonth: number;
    readonly fullMonths: number;
  };
  /** The N closed months before this one, oldest first; it may reach into last year. */
  readonly window: MonthPeriod[];
  /** How many of the window's latest months had history and were averaged. */
  readonly monthsUsed: number;
  readonly income: ProjectionFigures;
  readonly expense: ProjectionFigures;
  /** By type, then Category id; the type totals are their sums. */
  readonly categories: CategoryProjection[];
  /** Every rule with an occurrence left this year, in the order given. */
  readonly recurring: RecurringAssumption[];
  readonly ratesUsed: R[];
  /** Currency codes left out for want of a rate. */
  readonly missing: string[];
  readonly warnings: ProjectionWarning[];
}

const ZERO: ProjectionFigures = {
  actual: 0n,
  average: 0n,
  variable: 0n,
  recurring: 0n,
  projected: 0n,
};

function addFigures(a: ProjectionFigures, b: ProjectionFigures): ProjectionFigures {
  return {
    actual: a.actual + b.actual,
    average: a.average + b.average,
    variable: a.variable + b.variable,
    recurring: a.recurring + b.recurring,
    projected: a.projected + b.projected,
  };
}

/** Converts Amounts into the Base Currency, keeping the rates it used and the currencies it lacked. */
class Converter<R extends ExchangeRate> {
  readonly ratesUsed = new Map<string, R>();
  readonly missing = new Set<string>();

  constructor(
    private readonly base: Currency,
    private readonly rates: readonly R[],
  ) {}

  convert(amounts: readonly Money[], day: IsoDay): bigint {
    if (amounts.length === 0) return 0n;
    const result = toBaseCurrency(amounts, this.base, this.rates, day);
    for (const rate of result.ratesUsed) {
      this.ratesUsed.set(`${rate.currency}|${rate.effectiveOn}`, rate);
    }
    for (const currency of result.missing) this.missing.add(currency.code);
    return result.total.amount;
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * The Automatic Projection of the current Workspace-Calendar year, per type and
 * per Category: P = A + round(V × rem) + R, where A is what happened up to
 * today, V the average monthly variable (non-recurring) amount over the last N
 * closed months that have history, rem the months left (whole ones plus the
 * rest of this one), and R what active Recurring Rules bring after today.
 *
 * Amounts are converted into the Base Currency per Category and month at the
 * month's rate (today's for this year's actuals and for rules); V × rem is
 * rounded half away from zero, once.
 */
export function projectYear<R extends ExchangeRate>(input: ProjectionInput<R>): Projection<R> {
  const { calendar, today } = input;
  const date = calendarDateOf(today, calendar);
  const year = { kind: 'year', year: date.year } as const;
  const { from: yearStart, until: nextYear } = periodDays(year, calendar);
  const thisMonth: MonthPeriod = { kind: 'month', year: date.year, month: date.month };
  const monthDays = daysInMonth(calendar, date.year, date.month);
  const remaining = {
    daysLeftInMonth: monthDays - date.day,
    daysInMonth: monthDays,
    fullMonths: 12 - date.month,
  };

  const window: MonthPeriod[] = [];
  for (let month = thisMonth, i = 0; i < input.trailingMonths; i++) {
    month = previousPeriod(month);
    window.unshift(month);
  }
  const historyFrom = input.historyFrom;
  const used = window.filter(
    (month) => historyFrom !== null && periodDays(month, calendar).until > historyFrom,
  );
  const usedDays = used.map((month) => periodDays(month, calendar));

  // Gather Amounts per Category: this year's actuals, and variable ones per window month.
  const key = (type: TransactionType, categoryId: string) => `${type}|${categoryId}`;
  const categories = new Map<string, { type: TransactionType; categoryId: string }>();
  const actuals = new Map<string, Money[]>();
  const variable = new Map<string, Money[][]>();
  for (const t of input.transactions) {
    if (t.type === 'TRANSFER' || t.categoryId === null) continue;
    const k = key(t.type, t.categoryId);
    if (t.occurredOn >= yearStart && t.occurredOn <= today) {
      categories.set(k, { type: t.type, categoryId: t.categoryId });
      push(actuals, k, t.amount);
    }
    if (t.recurring) continue;
    const m = usedDays.findIndex(({ from, until }) => t.occurredOn >= from && t.occurredOn < until);
    if (m < 0) continue;
    categories.set(k, { type: t.type, categoryId: t.categoryId });
    let months = variable.get(k);
    if (!months) variable.set(k, (months = used.map(() => [])));
    months[m]?.push(t.amount);
  }

  const converter = new Converter(input.base, input.rates);
  const recurring: RecurringAssumption[] = [];
  const recurringByCategory = new Map<string, bigint>();
  for (const rule of input.rules) {
    const occurrences = occurrencesBetween(rule, calendar, addDays(today, 1), nextYear);
    if (occurrences.length === 0) continue;
    const amount = money(rule.amount.amount * BigInt(occurrences.length), rule.amount.currency);
    const total = converter.convert([amount], today);
    const k = key(rule.type, rule.categoryId);
    categories.set(k, { type: rule.type, categoryId: rule.categoryId });
    recurringByCategory.set(k, (recurringByCategory.get(k) ?? 0n) + total);
    recurring.push({
      ruleId: rule.id,
      name: rule.name,
      type: rule.type,
      categoryId: rule.categoryId,
      occurrences,
      total,
    });
  }

  // rem = (fullMonths × daysInMonth + daysLeft) / daysInMonth, kept exact until the last multiply.
  const remNumerator = BigInt(remaining.fullMonths * monthDays + remaining.daysLeftInMonth);
  const actualDay = rateDayOf(year, calendar, today);
  const byCategory: CategoryProjection[] = [...categories]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, { type, categoryId }]) => {
      const actual = converter.convert(actuals.get(k) ?? [], actualDay);
      const months = variable.get(k) ?? [];
      const windowSum = used.reduce(
        (sum, month, m) =>
          sum + converter.convert(months[m] ?? [], rateDayOf(month, calendar, today)),
        0n,
      );
      const count = BigInt(used.length);
      const average = count === 0n ? 0n : divRound(windowSum, count);
      const varPart =
        count === 0n ? 0n : divRound(windowSum * remNumerator, count * BigInt(monthDays));
      const recurringPart = recurringByCategory.get(k) ?? 0n;
      return {
        categoryId,
        type,
        actual,
        average,
        variable: varPart,
        recurring: recurringPart,
        projected: actual + varPart + recurringPart,
      };
    });

  const totalOf = (type: TransactionType) =>
    byCategory.filter((c) => c.type === type).reduce<ProjectionFigures>(addFigures, ZERO);
  const missing = [...converter.missing].sort();
  const warnings: ProjectionWarning[] = [];
  if (used.length === 0) {
    warnings.push({ kind: 'no_history', monthsWanted: window.length });
  } else if (used.length < window.length) {
    warnings.push({
      kind: 'short_history',
      monthsUsed: used.length,
      monthsWanted: window.length,
    });
  }
  if (missing.length > 0) warnings.push({ kind: 'missing_rates', currencies: missing });

  return {
    year: date.year,
    today,
    yearEnd: addDays(nextYear, -1),
    remaining,
    window,
    monthsUsed: used.length,
    income: totalOf('INCOME'),
    expense: totalOf('EXPENSE'),
    categories: byCategory,
    recurring,
    ratesUsed: [...converter.ratesUsed.values()],
    missing,
    warnings,
  };
}
