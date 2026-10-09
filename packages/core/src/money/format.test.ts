import { describe, expect, it } from 'vitest';
import { EUR, IRR, USD, formatMoney, money } from './index';
import type { Currency } from './index';

const fa = { locale: 'fa', digits: 'persian' } as const;
const en = { locale: 'en', digits: 'latin' } as const;

describe('formatMoney', () => {
  it('formats rials in Persian with Persian digits and grouping', () => {
    expect(formatMoney(money(12345000n, IRR), fa)).toBe('۱۲٬۳۴۵٬۰۰۰ ریال');
    expect(formatMoney(money(0n, IRR), fa)).toBe('۰ ریال');
    expect(formatMoney(money(999n, IRR), fa)).toBe('۹۹۹ ریال');
  });

  it('formats IRR as tomans in Toman display', () => {
    const toman = { ...fa, display: 'toman' } as const;
    expect(formatMoney(money(12345000n, IRR), toman)).toBe('۱٬۲۳۴٬۵۰۰ تومان');
    expect(formatMoney(money(125n, IRR), toman)).toBe('۱۲٫۵ تومان');
    expect(formatMoney(money(5n, IRR), toman)).toBe('۰٫۵ تومان');
    expect(formatMoney(money(-125n, IRR), toman)).toBe('-۱۲٫۵ تومان');
  });

  it('uses Latin digits and separators when asked', () => {
    expect(formatMoney(money(12345000n, IRR), { ...fa, digits: 'latin' })).toBe('12,345,000 ریال');
    expect(formatMoney(money(123456n, USD), { ...fa, digits: 'latin' })).toBe('1,234.56 دلار');
  });

  it('formats in English', () => {
    expect(formatMoney(money(123456n, USD), en)).toBe('1,234.56 USD');
    expect(formatMoney(money(1200n, USD), en)).toBe('12.00 USD');
    expect(formatMoney(money(5n, EUR), en)).toBe('0.05 EUR');
    expect(formatMoney(money(12345000n, IRR), en)).toBe('12,345,000 Rial');
    expect(formatMoney(money(12345000n, IRR), { ...en, display: 'toman' })).toBe('1,234,500 Toman');
  });

  it('shows all of a currency’s decimals in Persian', () => {
    expect(formatMoney(money(-102n, USD), fa)).toBe('-۱٫۰۲ دلار');
  });

  it('ignores Toman display for currencies other than IRR', () => {
    expect(formatMoney(money(1250n, USD), { ...en, display: 'toman' })).toBe('12.50 USD');
  });

  it('falls back to the currency code for unknown currencies', () => {
    const GBP: Currency = { code: 'GBP', minorUnits: 2 };
    const KWD: Currency = { code: 'KWD', minorUnits: 3 };
    expect(formatMoney(money(100n, GBP), fa)).toBe('۱٫۰۰ GBP');
    expect(formatMoney(money(1234567n, KWD), en)).toBe('1,234.567 KWD');
  });

  it('formats amounts beyond 2^53 exactly', () => {
    expect(formatMoney(money(9007199254740993n, IRR), en)).toBe('9,007,199,254,740,993 Rial');
    expect(formatMoney(money(-9223372036854775808n, USD), en)).toBe(
      '-92,233,720,368,547,758.08 USD',
    );
  });

  it('can omit the currency label and grouping (e.g. for input fields)', () => {
    expect(formatMoney(money(123456n, USD), { ...en, label: false })).toBe('1,234.56');
    expect(formatMoney(money(123456n, USD), { ...en, label: false, grouping: false })).toBe(
      '1234.56',
    );
    expect(
      formatMoney(money(12345n, IRR), { ...fa, display: 'toman', label: false, grouping: false }),
    ).toBe('۱۲۳۴٫۵');
  });
});
