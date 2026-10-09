import { displayDecimals, fitsInt64, money } from './money';
import type { Currency, Money, MoneyDisplay } from './money';

export type ParseAmountError = 'empty' | 'invalid' | 'too_many_decimals' | 'out_of_range';

export type ParseAmountResult =
  | { readonly ok: true; readonly money: Money }
  | { readonly ok: false; readonly error: ParseAmountError };

export interface ParseAmountOptions {
  /** In Toman display, IRR input is in tomans and is stored x10 in rials. */
  readonly display?: MoneyDisplay;
}

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

const GROUP_SEPARATOR = /[\s,٬،]/;
const NUMBER = /^(-?)([\d\s,٬،]*)(?:\.(\d*))?$/;

/** Strips grouping separators from the whole part, if they sit between groups of three. */
function ungroup(whole: string): string | undefined {
  const groups = whole.split(GROUP_SEPARATOR);
  const [first = '', ...rest] = groups;
  if (rest.length === 0) return first;
  if (!/^\d{1,3}$/.test(first) || !rest.every((g) => /^\d{3}$/.test(g))) return undefined;
  return groups.join('');
}

/**
 * Parses user-typed text into Money without going through floating point.
 * Accepts Persian/Arabic-Indic digits, grouping separators and a leading minus.
 */
export function parseAmount(
  text: string,
  currency: Currency,
  options: ParseAmountOptions = {},
): ParseAmountResult {
  const normalized = toLatinDigits(text).trim().replace(/٫/g, '.').replace(/^−/, '-');
  if (normalized === '') return { ok: false, error: 'empty' };

  const match = NUMBER.exec(normalized);
  const [, sign = '', groupedWhole = '', rawFraction = ''] = match ?? [];
  const whole = ungroup(groupedWhole);
  if (!match || whole === undefined || whole + rawFraction === '') {
    return { ok: false, error: 'invalid' };
  }

  const scale = displayDecimals(currency, options.display);
  const fraction = rawFraction.replace(/0+$/, '');
  if (fraction.length > scale) return { ok: false, error: 'too_many_decimals' };

  const magnitude = BigInt(whole + fraction.padEnd(scale, '0'));
  const amount = sign === '-' ? -magnitude : magnitude;
  if (!fitsInt64(amount)) return { ok: false, error: 'out_of_range' };
  return { ok: true, money: money(amount, currency) };
}
