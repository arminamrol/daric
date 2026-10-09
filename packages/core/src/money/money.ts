/** A currency and how many decimals its minor unit has (ADR-0004). */
export interface Currency {
  readonly code: string;
  readonly minorUnits: number;
}

export const IRR: Currency = { code: 'IRR', minorUnits: 0 };
export const USD: Currency = { code: 'USD', minorUnits: 2 };
export const EUR: Currency = { code: 'EUR', minorUnits: 2 };

/** An Amount: an integer count of `currency`'s minor unit. */
export interface Money {
  readonly amount: bigint;
  readonly currency: Currency;
}

/** Postgres `bigint` bounds; every stored Amount must fit. */
export const INT64_MIN = -(2n ** 63n);
export const INT64_MAX = 2n ** 63n - 1n;

export function fitsInt64(amount: bigint): boolean {
  return amount >= INT64_MIN && amount <= INT64_MAX;
}

/** How IRR amounts are shown and typed: as rials, or as tomans (1 toman = 10 rials). */
export type MoneyDisplay = 'rial' | 'toman';

/**
 * How many decimals `currency` has when shown or typed in `display`.
 * In Toman display IRR gains one decimal, since a rial is a tenth of a toman.
 */
export function displayDecimals(currency: Currency, display: MoneyDisplay = 'rial'): number {
  return currency.minorUnits + (display === 'toman' && currency.code === IRR.code ? 1 : 0);
}

export class CurrencyMismatchError extends Error {
  constructor(a: Currency, b: Currency) {
    super(`Cannot combine ${a.code} with ${b.code}`);
    this.name = 'CurrencyMismatchError';
  }
}

export function money(amount: bigint, currency: Currency): Money {
  return { amount, currency };
}

function assertSameCurrency(a: Currency, b: Currency): void {
  if (a.code !== b.code) throw new CurrencyMismatchError(a, b);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a.currency, b.currency);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a.currency, b.currency);
  return money(a.amount - b.amount, a.currency);
}

/** Sums `items`, all of which must be in `currency`; an empty list is zero. */
export function sum(currency: Currency, items: readonly Money[]): Money {
  let total = 0n;
  for (const item of items) {
    assertSameCurrency(currency, item.currency);
    total += item.amount;
  }
  return money(total, currency);
}

export function negate(m: Money): Money {
  return money(-m.amount, m.currency);
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a.currency, b.currency);
  return a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0;
}

export function equals(a: Money, b: Money): boolean {
  return compare(a, b) === 0;
}

export function isZero(m: Money): boolean {
  return m.amount === 0n;
}

/** `numerator / denominator` rounded half away from zero. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (2n * n + d) / (2n * d);
  return negative ? -quotient : quotient;
}
