import { describe, expect, it } from 'vitest';
import { EUR, IRR, USD, money } from '../money';
import { formatRate, parseRate, rateDayOf, rateOn, toBaseCurrency } from './rates';

const usd = (effectiveOn: string, rate: string) => ({ currency: 'USD', rate, effectiveOn });
const eur = (effectiveOn: string, rate: string) => ({ currency: 'EUR', rate, effectiveOn });

describe('rateOn', () => {
  const rates = [
    usd('2026-10-01', '1000000'),
    usd('2026-09-01', '900000'),
    eur('2026-09-15', '1100000'),
  ];

  it('is the latest rate of the currency effective on or before the day', () => {
    expect(rateOn(rates, 'USD', '2026-09-30')).toEqual(usd('2026-09-01', '900000'));
    expect(rateOn(rates, 'USD', '2026-12-31')).toEqual(usd('2026-10-01', '1000000'));
  });

  it('takes a rate effective on the day itself', () => {
    expect(rateOn(rates, 'USD', '2026-10-01')).toEqual(usd('2026-10-01', '1000000'));
    expect(rateOn(rates, 'EUR', '2026-09-15')).toEqual(eur('2026-09-15', '1100000'));
  });

  it('is missing before the first rate of the currency, or for a currency without rates', () => {
    expect(rateOn(rates, 'USD', '2026-08-31')).toBeUndefined();
    expect(rateOn(rates, 'EUR', '2026-09-14')).toBeUndefined();
    expect(rateOn(rates, 'GBP', '2026-12-31')).toBeUndefined();
  });
});

describe('toBaseCurrency', () => {
  const rates = [usd('2026-09-01', '900000'), usd('2026-10-01', '1000000.5')];

  it('adds every currency up in the Base Currency at the rate in force on the day', () => {
    const result = toBaseCurrency(
      [money(5_000_000n, IRR), money(1250n, USD), money(-250n, USD)],
      IRR,
      rates,
      '2026-10-11',
    );
    // 10.00 USD at 1,000,000.5 rials each.
    expect(result.total).toEqual(money(15_000_005n, IRR));
    expect(result.byCurrency).toEqual([money(5_000_000n, IRR), money(1000n, USD)]);
    expect(result.ratesUsed).toEqual([usd('2026-10-01', '1000000.5')]);
    expect(result.missing).toEqual([]);
  });

  it('uses the older rate for a day before the newer one', () => {
    const result = toBaseCurrency([money(100n, USD)], IRR, rates, '2026-09-30');
    expect(result.total).toEqual(money(900_000n, IRR));
    expect(result.ratesUsed).toEqual([usd('2026-09-01', '900000')]);
  });

  it('leaves out a currency with no rate on the day and names it as missing', () => {
    const result = toBaseCurrency(
      [money(1_000n, IRR), money(100n, EUR), money(100n, USD)],
      IRR,
      rates,
      '2026-08-31',
    );
    expect(result.total).toEqual(money(1_000n, IRR));
    expect(result.byCurrency).toEqual([money(100n, EUR), money(1_000n, IRR), money(100n, USD)]);
    expect(result.missing).toEqual([EUR, USD]);
    expect(result.ratesUsed).toEqual([]);
  });

  it('needs no rate for a currency that adds up to zero', () => {
    const result = toBaseCurrency([money(100n, EUR), money(-100n, EUR)], IRR, [], '2026-10-11');
    expect(result.total).toEqual(money(0n, IRR));
    expect(result.missing).toEqual([]);
    expect(result.byCurrency).toEqual([money(0n, EUR)]);
  });

  it('is zero in the Base Currency for no amounts', () => {
    expect(toBaseCurrency([], USD, rates, '2026-10-11')).toEqual({
      total: money(0n, USD),
      byCurrency: [],
      ratesUsed: [],
      missing: [],
    });
  });

  it('converts into a Base Currency with decimals', () => {
    const toUsd = [{ currency: 'IRR', rate: '0.000001', effectiveOn: '2026-01-01' }];
    const result = toBaseCurrency([money(12_345_678n, IRR)], USD, toUsd, '2026-10-11');
    // 12.345678 USD rounds half away from zero to 12.35.
    expect(result.total).toEqual(money(1235n, USD));
  });
});

describe('rateDayOf', () => {
  // Mehr 1405 runs from 2026-09-23 to 2026-10-22.
  const mehr = { kind: 'month', year: 1405, month: 7 } as const;

  it('is the last day of a past Period', () => {
    expect(rateDayOf(mehr, 'jalali', '2026-11-05')).toBe('2026-10-22');
    expect(rateDayOf({ kind: 'year', year: 2025 }, 'gregorian', '2026-10-11')).toBe('2025-12-31');
  });

  it('is today in the current Period', () => {
    expect(rateDayOf(mehr, 'jalali', '2026-10-11')).toBe('2026-10-11');
    expect(rateDayOf({ kind: 'year', year: 1405 }, 'jalali', '2026-10-11')).toBe('2026-10-11');
  });
});

describe('parseRate', () => {
  const toIrr = { currency: USD, base: IRR };

  it('reads a rate as typed, with Persian digits and grouping', () => {
    expect(parseRate('۱٬۰۵۰٬۰۰۰', toIrr)).toEqual({ ok: true, rate: '1050000' });
    expect(parseRate(' 1,050,000.50 ', toIrr)).toEqual({ ok: true, rate: '1050000.5' });
    expect(parseRate('0.00012300', { currency: IRR, base: USD })).toEqual({
      ok: true,
      rate: '0.000123',
    });
  });

  it('stores a rate typed in tomans x10 in rials', () => {
    expect(parseRate('105,000', { ...toIrr, display: 'toman' })).toEqual({
      ok: true,
      rate: '1050000',
    });
    expect(parseRate('105000.25', { ...toIrr, display: 'toman' })).toEqual({
      ok: true,
      rate: '1050002.5',
    });
  });

  it('stores the rate of one toman as a tenth of it for one rial', () => {
    expect(parseRate('0.00001', { currency: IRR, base: USD, display: 'toman' })).toEqual({
      ok: true,
      rate: '0.000001',
    });
  });

  it('rejects text that is no positive rate', () => {
    expect(parseRate('  ', toIrr)).toEqual({ ok: false, error: 'empty' });
    expect(parseRate('abc', toIrr)).toEqual({ ok: false, error: 'invalid' });
    expect(parseRate('-5', toIrr)).toEqual({ ok: false, error: 'invalid' });
    expect(parseRate('1,00', toIrr)).toEqual({ ok: false, error: 'invalid' });
    expect(parseRate('0.000', toIrr)).toEqual({ ok: false, error: 'not_positive' });
  });

  it('rejects more precision or size than a stored rate holds', () => {
    expect(parseRate('0.0000000000001', toIrr)).toEqual({ ok: false, error: 'too_many_decimals' });
    expect(parseRate('1234567890123456789', toIrr)).toEqual({ ok: false, error: 'out_of_range' });
  });
});

describe('formatRate', () => {
  it('groups the whole part in the chosen digits', () => {
    expect(formatRate('1050000.5', { currency: USD, base: IRR, digits: 'latin' })).toBe(
      '1,050,000.5',
    );
    expect(formatRate('1050000', { currency: USD, base: IRR, digits: 'persian' })).toBe(
      '۱٬۰۵۰٬۰۰۰',
    );
  });

  it('shows a rate into IRR in tomans in Toman display, and a rate of IRR per toman', () => {
    const toman = { display: 'toman', digits: 'latin' } as const;
    expect(formatRate('1050002.5', { currency: USD, base: IRR, ...toman })).toBe('105,000.25');
    expect(formatRate('1050000', { currency: USD, base: IRR, ...toman })).toBe('105,000');
    expect(formatRate('0.000001', { currency: IRR, base: USD, ...toman })).toBe('0.00001');
  });
});
