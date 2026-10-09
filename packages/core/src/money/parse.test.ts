import { describe, expect, it } from 'vitest';
import { IRR, USD, money, parseAmount } from './index';

const ok = (m: ReturnType<typeof money>) => ({ ok: true, money: m });
const fail = (error: string) => ({ ok: false, error });

describe('parseAmount', () => {
  it('parses whole and decimal input into minor units', () => {
    expect(parseAmount('12', USD)).toEqual(ok(money(1200n, USD)));
    expect(parseAmount('12.3', USD)).toEqual(ok(money(1230n, USD)));
    expect(parseAmount('12.34', USD)).toEqual(ok(money(1234n, USD)));
    expect(parseAmount('0.05', USD)).toEqual(ok(money(5n, USD)));
    expect(parseAmount('.5', USD)).toEqual(ok(money(50n, USD)));
    expect(parseAmount('7.', USD)).toEqual(ok(money(700n, USD)));
    expect(parseAmount('1500', IRR)).toEqual(ok(money(1500n, IRR)));
  });

  it('never loses precision (1.02 stays 1.02)', () => {
    expect(parseAmount('1.02', USD)).toEqual(ok(money(102n, USD)));
    expect(parseAmount('0.29', USD)).toEqual(ok(money(29n, USD)));
    expect(parseAmount('4.35', USD)).toEqual(ok(money(435n, USD)));
  });

  it('parses values beyond 2^53 exactly', () => {
    expect(parseAmount('9007199254740993', IRR)).toEqual(ok(money(9007199254740993n, IRR)));
    expect(parseAmount('90071992547409.93', USD)).toEqual(ok(money(9007199254740993n, USD)));
  });

  it('accepts Persian and Arabic-Indic digits and separators', () => {
    expect(parseAmount('۱۲٬۳۴۵', IRR)).toEqual(ok(money(12345n, IRR)));
    expect(parseAmount('١٢٣', IRR)).toEqual(ok(money(123n, IRR)));
    expect(parseAmount('۱۲٫۵', USD)).toEqual(ok(money(1250n, USD)));
  });

  it('ignores grouping separators and surrounding whitespace', () => {
    expect(parseAmount(' 1,234,567 ', IRR)).toEqual(ok(money(1234567n, IRR)));
    expect(parseAmount('1 234.50', USD)).toEqual(ok(money(123450n, USD)));
  });

  it('accepts a leading minus sign', () => {
    expect(parseAmount('-12.5', USD)).toEqual(ok(money(-1250n, USD)));
    expect(parseAmount('−3', IRR)).toEqual(ok(money(-3n, IRR)));
    expect(parseAmount('-0', IRR)).toEqual(ok(money(0n, IRR)));
  });

  it('rejects more decimals than the currency allows', () => {
    expect(parseAmount('1.234', USD)).toEqual(fail('too_many_decimals'));
    expect(parseAmount('1.5', IRR)).toEqual(fail('too_many_decimals'));
  });

  it('allows trailing zero decimals that lose nothing', () => {
    expect(parseAmount('1.500', USD)).toEqual(ok(money(150n, USD)));
    expect(parseAmount('12.0', IRR)).toEqual(ok(money(12n, IRR)));
  });

  it('rejects empty and malformed input', () => {
    expect(parseAmount('', USD)).toEqual(fail('empty'));
    expect(parseAmount('  ', USD)).toEqual(fail('empty'));
    for (const text of ['abc', '1.2.3', '1e5', '--1', '1-', '.', '-', '12a', 'Infinity', 'NaN']) {
      expect(parseAmount(text, USD), text).toEqual(fail('invalid'));
    }
  });

  it('rejects amounts that do not fit a 64-bit integer', () => {
    expect(parseAmount('9223372036854775807', IRR)).toEqual(ok(money(9223372036854775807n, IRR)));
    expect(parseAmount('9223372036854775808', IRR)).toEqual(fail('out_of_range'));
    expect(parseAmount('-9223372036854775808', IRR)).toEqual(ok(money(-9223372036854775808n, IRR)));
    expect(parseAmount('92233720368547758.08', USD)).toEqual(fail('out_of_range'));
  });

  describe('in Toman display', () => {
    it('stores the input x10 in rials', () => {
      expect(parseAmount('1500', IRR, { display: 'toman' })).toEqual(ok(money(15000n, IRR)));
      expect(parseAmount('۲٬۵۰۰٬۰۰۰', IRR, { display: 'toman' })).toEqual(
        ok(money(25000000n, IRR)),
      );
    });

    it('accepts one decimal (a single rial)', () => {
      expect(parseAmount('12.5', IRR, { display: 'toman' })).toEqual(ok(money(125n, IRR)));
      expect(parseAmount('12.55', IRR, { display: 'toman' })).toEqual(fail('too_many_decimals'));
    });

    it('does not affect other currencies', () => {
      expect(parseAmount('12.5', USD, { display: 'toman' })).toEqual(ok(money(1250n, USD)));
    });
  });
});
