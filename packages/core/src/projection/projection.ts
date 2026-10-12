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

/**
 * How the Projection is worked out: Automatic (actuals + Trailing Average +
 * Recurring Rules), Manual (actuals + Planned Items), or Combined (per
 * Category, a Fixed Monthly Planned Item over Recurring Rules over the
 * Trailing Average; One-Off Planned Items added).
 */
export const projectionModes = ['AUTOMATIC', 'MANUAL', 'COMBINED'] as const;
export type ProjectionMode = (typeof projectionModes)[number];

/** A Planned Item comes every month on its start's day, or once on that day. */
export const plannedItemKinds = ['FIXED_MONTHLY', 'ONE_OFF'] as const;
export type PlannedItemKind = (typeof plannedItemKinds)[number];

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

/** A user-entered expected amount; a Fixed Monthly one always has a Category. */
export interface ProjectionPlannedItem {
  readonly id: string;
  readonly name: string;
  readonly kind: PlannedItemKind;
  readonly type: TransactionType;
  readonly categoryId: string | null;
  /** Per month for a Fixed Monthly item. */
  readonly amount: Money;
  /** A One-Off's day, or a Fixed Monthly's first; its day of the month repeats. */
  readonly startOn: IsoDay;
  /** A Fixed Monthly's last day; null runs on. Always null for a One-Off. */
  readonly endOn: IsoDay | null;
}

export interface ProjectionInput<R extends ExchangeRate = ExchangeRate> {
  readonly calendar: CalendarSystem;
  /** Automatic when left out. */
  readonly mode?: ProjectionMode;
  /** Today in the Workspace's timezone. */
  readonly today: IsoDay;
  /** N: how many closed months the Trailing Average looks back over. */
  readonly trailingMonths: number;
  readonly base: Currency;
  readonly rates: readonly R[];
  readonly transactions: readonly ProjectionTransaction[];
  readonly rules: readonly ProjectionRule[];
  /** Counted in Manual and Combined mode only. */
  readonly plannedItems?: readonly ProjectionPlannedItem[];
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
  /** What Planned Items will bring after today up to the year end. */
  readonly planned: bigint;
  /** P = A + round(V × rem) + R + planned; a mode leaves out what it does not use. */
  readonly projected: bigint;
}

export interface CategoryProjection extends ProjectionFigures {
  /** Null only for One-Off Planned Items with no Category. */
  readonly categoryId: string | null;
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

/** A Planned Item's part in the Projection. */
export interface PlannedAssumption {
  readonly itemId: string;
  readonly name: string;
  readonly kind: PlannedItemKind;
  readonly type: TransactionType;
  readonly categoryId: string | null;
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
  readonly mode: ProjectionMode;
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
  /** Every rule counted, with an occurrence left this year, in the order given. */
  readonly recurring: RecurringAssumption[];
  /** Every Planned Item counted, with an occurrence left this year, in the order given. */
  readonly planned: PlannedAssumption[];
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
  planned: 0n,
  projected: 0n,
};

function addFigures(a: ProjectionFigures, b: ProjectionFigures): ProjectionFigures {
  return {
    actual: a.actual + b.actual,
    average: a.average + b.average,
    variable: a.variable + b.variable,
    recurring: a.recurring + b.recurring,
    planned: a.planned + b.planned,
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

/** The `n` closed months before `month`, oldest first; they may reach into last year. */
export function trailingWindow(month: MonthPeriod, n: number): MonthPeriod[] {
  const window: MonthPeriod[] = [];
  for (let m = month, i = 0; i < n; i++) {
    m = previousPeriod(m);
    window.unshift(m);
  }
  return window;
}

/** A Planned Item's occurrences from `from` up to, not including, `until`. */
function plannedOccurrences(
  item: ProjectionPlannedItem,
  calendar: CalendarSystem,
  from: IsoDay,
  until: IsoDay,
): IsoDay[] {
  if (item.kind === 'ONE_OFF') {
    return item.startOn >= from && item.startOn < until ? [item.startOn] : [];
  }
  const schedule: RecurrenceSchedule = {
    frequency: 'MONTHLY',
    interval: 1,
    startOn: item.startOn,
    endOn: item.endOn,
  };
  return occurrencesBetween(schedule, calendar, from, until);
}

/**
 * The Projection of the current Workspace-Calendar year, per type and per
 * Category. A is what happened up to today, V the average monthly variable
 * (non-recurring) amount over the last N closed months that have history, rem
 * the months left (whole ones plus the rest of this one), R what active
 * Recurring Rules bring after today, and planned what Planned Items bring.
 *
 * - Automatic: P = A + round(V × rem) + R.
 * - Manual: P = A + planned.
 * - Combined, per Category: a Fixed Monthly Planned Item overrides Recurring
 *   Rules, which override the Trailing Average; One-Offs are added.
 *
 * Amounts are converted into the Base Currency per Category and month at the
 * month's rate (today's for this year's actuals and for rules); V × rem is
 * rounded half away from zero, once.
 */
export function projectYear<R extends ExchangeRate>(input: ProjectionInput<R>): Projection<R> {
  const { calendar, today } = input;
  const mode = input.mode ?? 'AUTOMATIC';
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

  const window = trailingWindow(thisMonth, input.trailingMonths);
  const historyFrom = input.historyFrom;
  const used = window.filter(
    (month) => historyFrom !== null && periodDays(month, calendar).until > historyFrom,
  );
  const usedDays = used.map((month) => periodDays(month, calendar));

  // Gather Amounts per Category: this year's actuals, and variable ones per window month.
  const key = (type: TransactionType, categoryId: string | null) => `${type}|${categoryId ?? ''}`;
  const categories = new Map<string, { type: TransactionType; categoryId: string | null }>();
  const actuals = new Map<string, Money[]>();
  const variable = new Map<string, Money[][]>();
  for (const t of input.transactions) {
    if (t.type === 'TRANSFER' || t.categoryId === null) continue;
    const k = key(t.type, t.categoryId);
    if (t.occurredOn >= yearStart && t.occurredOn <= today) {
      categories.set(k, { type: t.type, categoryId: t.categoryId });
      push(actuals, k, t.amount);
    }
    if (t.recurring || mode === 'MANUAL') continue;
    const m = usedDays.findIndex(({ from, until }) => t.occurredOn >= from && t.occurredOn < until);
    if (m < 0) continue;
    categories.set(k, { type: t.type, categoryId: t.categoryId });
    let months = variable.get(k);
    if (!months) variable.set(k, (months = used.map(() => [])));
    months[m]?.push(t.amount);
  }

  const converter = new Converter(input.base, input.rates);
  const tomorrow = addDays(today, 1);
  const planned: PlannedAssumption[] = [];
  const plannedByCategory = new Map<string, bigint>();
  // Categories whose Fixed Monthly Planned Items override their rules and average.
  const fixedCategories = new Set<string>();
  for (const item of mode === 'AUTOMATIC' ? [] : (input.plannedItems ?? [])) {
    const occurrences = plannedOccurrences(item, calendar, tomorrow, nextYear);
    if (occurrences.length === 0) continue;
    const amount = money(item.amount.amount * BigInt(occurrences.length), item.amount.currency);
    const total = converter.convert([amount], today);
    const k = key(item.type, item.categoryId);
    categories.set(k, { type: item.type, categoryId: item.categoryId });
    plannedByCategory.set(k, (plannedByCategory.get(k) ?? 0n) + total);
    if (item.kind === 'FIXED_MONTHLY') fixedCategories.add(k);
    planned.push({
      itemId: item.id,
      name: item.name,
      kind: item.kind,
      type: item.type,
      categoryId: item.categoryId,
      occurrences,
      total,
    });
  }

  const recurring: RecurringAssumption[] = [];
  const recurringByCategory = new Map<string, bigint>();
  for (const rule of mode === 'MANUAL' ? [] : input.rules) {
    const occurrences = occurrencesBetween(rule, calendar, tomorrow, nextYear);
    if (occurrences.length === 0) continue;
    if (fixedCategories.has(key(rule.type, rule.categoryId))) continue;
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
      const recurringPart = recurringByCategory.get(k) ?? 0n;
      const plannedPart = plannedByCategory.get(k) ?? 0n;
      // Combined mode averages only Categories with neither a Fixed Monthly item nor a rule.
      const averaged =
        mode === 'AUTOMATIC' ||
        (mode === 'COMBINED' && !fixedCategories.has(k) && !recurringByCategory.has(k));
      const months = averaged ? (variable.get(k) ?? []) : [];
      const windowSum = used.reduce(
        (sum, month, m) =>
          sum + converter.convert(months[m] ?? [], rateDayOf(month, calendar, today)),
        0n,
      );
      const count = averaged ? BigInt(used.length) : 0n;
      const average = count === 0n ? 0n : divRound(windowSum, count);
      const varPart =
        count === 0n ? 0n : divRound(windowSum * remNumerator, count * BigInt(monthDays));
      return {
        categoryId,
        type,
        actual,
        average,
        variable: varPart,
        recurring: recurringPart,
        planned: plannedPart,
        projected: actual + varPart + recurringPart + plannedPart,
      };
    });

  const totalOf = (type: TransactionType) =>
    byCategory.filter((c) => c.type === type).reduce<ProjectionFigures>(addFigures, ZERO);
  const missing = [...converter.missing].sort();
  const warnings: ProjectionWarning[] = [];
  // Manual mode takes no average, so history does not matter there.
  const averages = mode !== 'MANUAL';
  if (averages && used.length === 0) {
    warnings.push({ kind: 'no_history', monthsWanted: window.length });
  } else if (averages && used.length < window.length) {
    warnings.push({
      kind: 'short_history',
      monthsUsed: used.length,
      monthsWanted: window.length,
    });
  }
  if (missing.length > 0) warnings.push({ kind: 'missing_rates', currencies: missing });

  return {
    mode,
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
    planned,
    ratesUsed: [...converter.ratesUsed.values()],
    missing,
    warnings,
  };
}
