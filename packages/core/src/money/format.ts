import { IRR, displayDecimals } from './money';
import type { Money, MoneyDisplay } from './money';

export type Locale = 'fa' | 'en';
export type Digits = 'persian' | 'latin';

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

function toPersianDigits(text: string): string {
  return text.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
}

/** Formats Money for display without converting it to a floating-point number. */
export function formatMoney(m: Money, options: FormatMoneyOptions): string {
  const { locale, digits, display = 'rial', label = true, grouping = true } = options;
  const isIrr = m.currency.code === IRR.code;
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
  const key = isIrr ? display : m.currency.code;
  return `${text} ${LABELS[locale][key] ?? m.currency.code}`;
}
