import { IRR, displayDecimals } from './money';
import type { Currency, Money, MoneyDisplay } from './money';
import { toPersianDigits } from '../locale';
import type { Digits, Locale } from '../locale';

export interface FormatMoneyOptions {
  readonly locale: Locale;
  readonly digits: Digits;
  /** How IRR is shown; ignored for other currencies. Defaults to rials. */
  readonly display?: MoneyDisplay;
  /** Append the currency name. Defaults to true. */
  readonly label?: boolean;
  /** Group thousands. Defaults to true. */
  readonly grouping?: boolean;
}

const LABELS: Record<Locale, Readonly<Record<string, string>>> = {
  fa: { rial: 'ریال', toman: 'تومان', USD: 'دلار', EUR: 'یورو' },
  en: { rial: 'Rial', toman: 'Toman' },
};

const SEPARATORS: Record<Digits, { group: string; decimal: string }> = {
  persian: { group: '٬', decimal: '٫' },
  latin: { group: ',', decimal: '.' },
};

/** A currency's name as money shows it; IRR is named by its Rial/Toman display. */
export function currencyName(
  currency: Currency,
  options: Pick<FormatMoneyOptions, 'locale' | 'display'>,
): string {
  const key = currency.code === IRR.code ? (options.display ?? 'rial') : currency.code;
  return LABELS[options.locale][key] ?? currency.code;
}

/** Formats Money for display without converting it to a floating-point number. */
export function formatMoney(m: Money, options: FormatMoneyOptions): string {
  const { locale, digits, display = 'rial', label = true, grouping = true } = options;
  const scale = displayDecimals(m.currency, display);
  const toman = scale !== m.currency.minorUnits;
  const { group, decimal } = SEPARATORS[digits];

  const negative = m.amount < 0n;
  const magnitude = (negative ? -m.amount : m.amount).toString();
  const padded = magnitude.padStart(scale + 1, '0');
  let whole = padded.slice(0, padded.length - scale);
  let fraction = padded.slice(padded.length - scale);
  // A toman's decimal (a rial) is shown only when it is not zero.
  if (toman && fraction === '0') fraction = '';

  if (grouping) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let text = whole + (fraction ? `.${fraction}` : '');
  text = text.replace(/[,.]/g, (c) => (c === ',' ? group : decimal));
  if (digits === 'persian') text = toPersianDigits(text);
  if (negative) text = `-${text}`;

  if (!label) return text;
  return `${text} ${currencyName(m.currency, { locale, display })}`;
}
