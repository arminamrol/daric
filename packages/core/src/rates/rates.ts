import { addDays, periodDays } from '../calendar';
import type { CalendarSystem, IsoDay, Period } from '../calendar';
import { toPersianDigits } from '../locale';
import type { Digits } from '../locale';
import { IRR, convertExactly, divRound, fitsInt64, money, toLatinDigits } from '../money';
import type { ExactConversion } from '../money';
import type { Currency, Money, MoneyDisplay } from '../money';

/**
 * An Exchange Rate: how many units of the Base Currency one unit of `currency`
 * is worth (a decimal string, as `convert` takes it), from `effectiveOn` until
 * the next rate of the same currency.
 */
export interface ExchangeRate {
  readonly currency: string;
  readonly rate: string;
  readonly effectiveOn: IsoDay;
}

/** The rate of `currency` in force on `day`: the latest effective on or before it. */
export function rateOn<R extends ExchangeRate>(
  rates: readonly R[],
  currency: string,
  day: IsoDay,
): R | undefined {
  let found: R | undefined;
  for (const rate of rates) {
    if (rate.currency !== currency || rate.effectiveOn > day) continue;
    if (!found || rate.effectiveOn > found.effectiveOn) found = rate;
  }
  return found;
}

/** A total of several currencies, in the Base Currency, with what went into it. */
export interface BaseTotal<R extends ExchangeRate = ExchangeRate> {
  /** Every currency converted and added up, leaving out those in `missing`. */
  readonly total: Money;
  /** One sum per currency, by currency code; the Base Currency's needs no rate. */
  readonly byCurrency: Money[];
  /** The rate each converted currency was converted at, by currency code. */
  readonly ratesUsed: R[];
  /** Currencies with something to convert but no rate on the day; `total` leaves them out. */
  readonly missing: Currency[];
}

/**
 * Adds up `amounts` of any currencies in `base`, converting each currency's sum
 * at its rate in force on `day` and rounding the total once. A currency with no rate that day is left out of
 * the total and reported as missing, never guessed.
 */
export function toBaseCurrency<R extends ExchangeRate>(
  amounts: readonly Money[],
  base: Currency,
  rates: readonly R[],
  day: IsoDay,
): BaseTotal<R> {
  const byCode = new Map<string, Money>();
  for (const amount of amounts) {
    const code = amount.currency.code;
    const sum = byCode.get(code)?.amount ?? 0n;
    byCode.set(code, money(sum + amount.amount, amount.currency));
  }
  const byCurrency = [...byCode.values()].sort((a, b) =>
    a.currency.code.localeCompare(b.currency.code),
  );

  // Every converted sum is kept exact and the total rounded once (ADR-0004).
  const exact: ExactConversion[] = [];
  const ratesUsed: R[] = [];
  const missing: Currency[] = [];
  for (const sum of byCurrency) {
    if (sum.currency.code === base.code) {
      exact.push({ numerator: sum.amount, scale: 0 });
      continue;
    }
    if (sum.amount === 0n) continue;
    const rate = rateOn(rates, sum.currency.code, day);
    if (!rate) {
      missing.push(sum.currency);
      continue;
    }
    exact.push(convertExactly(sum, base, rate.rate));
    ratesUsed.push(rate);
  }
  const scale = Math.max(0, ...exact.map((e) => e.scale));
  const numerator = exact.reduce(
    (acc, e) => acc + e.numerator * 10n ** BigInt(scale - e.scale),
    0n,
  );
  const total = divRound(numerator, 10n ** BigInt(scale));
  if (!fitsInt64(total)) throw new RangeError('Converted total does not fit a 64-bit integer');
  return { total: money(total, base), byCurrency, ratesUsed, missing };
}

/**
 * The day a total of `period` is converted on: the Period's last day, or
 * `today` while the Period is still running.
 */
export function rateDayOf(period: Period, calendar: CalendarSystem, today: IsoDay): IsoDay {
  const last = addDays(periodDays(period, calendar).until, -1);
  return today < last ? today : last;
}

/** A stored rate has at most this many digits before and after the decimal point. */
export const RATE_MAX_WHOLE_DIGITS = 18;
export const RATE_MAX_DECIMALS = 12;

/** `rate` without leading zeros in its whole part or trailing zeros in its decimals. */
export function canonicalRate(rate: string): string {
  const [whole = '', fraction = ''] = rate.split('.');
  return decimalText(whole + fraction, fraction.length);
}

/** Which rate is typed or shown, and how IRR is shown. */
export interface RateDisplayOptions {
  readonly currency: Currency;
  readonly base: Currency;
  /** In Toman display, a rate into IRR is in tomans, and a rate of IRR is per toman. */
  readonly display?: MoneyDisplay;
}

/** How many places a rate as shown is shifted left from the rate as stored (per rial). */
function tomanShift({ currency, base, display }: RateDisplayOptions): number {
  if (display !== 'toman') return 0;
  return (base.code === IRR.code ? 1 : 0) - (currency.code === IRR.code ? 1 : 0);
}

/** `digits / 10^scale` written as a decimal with no needless zeros. */
function decimalText(digits: string, scale: number): string {
  if (scale < 0) return decimalText(digits + '0'.repeat(-scale), 0);
  const padded = digits.padStart(scale + 1, '0');
  const whole = padded.slice(0, padded.length - scale).replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(padded.length - scale).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export type ParseRateError =
  'empty' | 'invalid' | 'not_positive' | 'too_many_decimals' | 'out_of_range';

export type ParseRateResult =
  | { readonly ok: true; readonly rate: string }
  | { readonly ok: false; readonly error: ParseRateError };

const RATE_TEXT = /^(\d+|\d{1,3}(?:[\s,٬،]\d{3})+)?(?:\.(\d*))?$/;

/**
 * Reads a typed rate (Persian digits and grouping allowed) into a stored rate.
 * In Toman display a rate into IRR is typed in tomans and stored x10.
 */
export function parseRate(text: string, options: RateDisplayOptions): ParseRateResult {
  const normalized = toLatinDigits(text).trim().replace(/٫/g, '.');
  if (normalized === '') return { ok: false, error: 'empty' };
  const match = RATE_TEXT.exec(normalized);
  const [, groupedWhole = '', fraction = ''] = match ?? [];
  if (!match || groupedWhole + fraction === '') return { ok: false, error: 'invalid' };

  const digits = groupedWhole.replace(/\D/g, '') + fraction;
  if (/^0*$/.test(digits)) return { ok: false, error: 'not_positive' };
  const rate = decimalText(digits, fraction.length - tomanShift(options));
  const [whole = '', decimals = ''] = rate.split('.');
  if (decimals.length > RATE_MAX_DECIMALS) return { ok: false, error: 'too_many_decimals' };
  if (whole.length > RATE_MAX_WHOLE_DIGITS) return { ok: false, error: 'out_of_range' };
  return { ok: true, rate };
}

/** A stored rate as shown: grouped, in `digits`, and in tomans where Toman display asks. */
export function formatRate(
  rate: string,
  options: RateDisplayOptions & { readonly digits: Digits },
): string {
  const [whole = '', fraction = ''] = rate.split('.');
  const shown = decimalText(whole + fraction, fraction.length + tomanShift(options));
  const [shownWhole = '', shownFraction = ''] = shown.split('.');
  const grouped = shownWhole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = shownFraction ? `${grouped}.${shownFraction}` : grouped;
  if (options.digits === 'latin') return text;
  return toPersianDigits(text.replace(/[,.]/g, (c) => (c === ',' ? '٬' : '٫')));
}
