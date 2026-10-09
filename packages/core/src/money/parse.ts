import { IRR, money } from './money';
import type { Currency, Money } from './money';

/** How IRR amounts are shown and typed: as rials, or as tomans (1 toman = 10 rials). */
export type MoneyDisplay = 'rial' | 'toman';

export type ParseAmountError = 'empty' | 'invalid' | 'too_many_decimals' | 'out_of_range';

export type ParseAmountResult =
  | { readonly ok: true; readonly money: Money }
  | { readonly ok: false; readonly error: ParseAmountError };

export interface ParseAmountOptions {
  /** In Toman display, IRR input is in tomans and is stored x10 in rials. */
  readonly display?: MoneyDisplay;
}

export const INT64_MIN = -(2n ** 63n);
export const INT64_MAX = 2n ** 63n - 1n;

const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

/** Replaces Persian and Arabic-Indic digits with ASCII digits. */
export function toLatinDigits(text: string): string {
  return text.replace(/[۰-۹٠-٩]/g, (d) => {
    const code = d.charCodeAt(0);
    const zero = code >= PERSIAN_ZERO ? PERSIAN_ZERO : ARABIC_INDIC_ZERO;
    return String(code - zero);
  });
}

const GROUPING = /[\s,٬،]/g;
const NUMBER = /^(-?)(\d*)(?:\.(\d*))?$/;

/**
 * Parses user-typed text into Money without going through floating point.
 * Accepts Persian/Arabic-Indic digits, grouping separators and a leading minus.
 */
export function parseAmount(
  text: string,
  currency: Currency,
  options: ParseAmountOptions = {},
): ParseAmountResult {
  const normalized = toLatinDigits(text)
    .replace(GROUPING, '')
    .replace(/٫/g, '.')
    .replace(/^−/, '-');
  if (normalized === '') return { ok: false, error: 'empty' };

  const match = NUMBER.exec(normalized);
  const [, sign = '', whole = '', rawFraction = ''] = match ?? [];
  if (!match || whole + rawFraction === '') return { ok: false, error: 'invalid' };

  const toman = options.display === 'toman' && currency.code === IRR.code;
  const scale = currency.minorUnits + (toman ? 1 : 0);
  const fraction = rawFraction.replace(/0+$/, '');
  if (fraction.length > scale) return { ok: false, error: 'too_many_decimals' };

  const magnitude = BigInt(whole + fraction.padEnd(scale, '0'));
  const amount = sign === '-' ? -magnitude : magnitude;
  if (amount < INT64_MIN || amount > INT64_MAX) return { ok: false, error: 'out_of_range' };
  return { ok: true, money: money(amount, currency) };
}
