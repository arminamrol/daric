import { describe, expect, it } from 'vitest';
import { EUR, IRR, USD, convert, money } from './index';

describe('convert', () => {
  it('converts with a whole-number rate', () => {
    // 12.34 USD at 1 USD = 1,050,000 IRR
    expect(convert(money(1234n, USD), IRR, '1050000')).toEqual(money(12957000n, IRR));
  });

  it('converts with a fractional rate using integer math', () => {
    // 1,000,000 IRR at 1 IRR = 0.00000095 USD -> 0.95 USD
    expect(convert(money(1000000n, IRR), USD, '0.00000095')).toEqual(money(95n, USD));
    // 1.02 USD at 1 USD = 0.9 EUR -> 0.918 -> 0.92
    expect(convert(money(102n, USD), EUR, '0.9')).toEqual(money(92n, EUR));
  });

  it('rounds half away from zero, once', () => {
    // 0.05 USD * 0.5 = 0.025 -> 0.03
    expect(convert(money(5n, USD), EUR, '0.5')).toEqual(money(3n, EUR));
    expect(convert(money(-5n, USD), EUR, '0.5')).toEqual(money(-3n, EUR));
    // 1 IRR at 0.5 -> 0.5 -> 1 (tie away from zero)
    expect(convert(money(1n, IRR), IRR, '0.5')).toEqual(money(1n, IRR));
    // 0.15 USD at 1 USD = 10 IRR -> 1.5 IRR -> 2
    expect(convert(money(15n, USD), IRR, '10')).toEqual(money(2n, IRR));
    // 0.44 at rate 1.125 = 0.495 -> 0.50
    expect(convert(money(44n, USD), EUR, '1.125')).toEqual(money(50n, EUR));
  });

  it('keeps precision beyond 2^53', () => {
    // (2^53 + 1) cents * 3.5 = 31525197391593475.5 -> ...476
    expect(convert(money(2n ** 53n + 1n, USD), EUR, '3.5')).toEqual(money(31525197391593476n, EUR));
  });

  it('converts to the same currency with rate 1 unchanged', () => {
    expect(convert(money(1234n, USD), USD, '1')).toEqual(money(1234n, USD));
  });

  it('accepts trailing zeros in the rate', () => {
    expect(convert(money(100n, USD), EUR, '0.90000000')).toEqual(money(90n, EUR));
  });

  it('rejects malformed or non-positive rates', () => {
    for (const rate of ['', '0', '0.000', '-1', '1e3', 'abc', '1.2.3', '.5', ' 1', '۱']) {
      expect(() => convert(money(1n, USD), IRR, rate), rate).toThrow(RangeError);
    }
  });
});
