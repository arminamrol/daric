import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  IRR,
  USD,
  add,
  compare,
  divRound,
  equals,
  isZero,
  money,
  negate,
  subtract,
  sum,
} from './index';

describe('currencies', () => {
  it('declare their minor units', () => {
    expect(IRR).toEqual({ code: 'IRR', minorUnits: 0 });
    expect(USD).toEqual({ code: 'USD', minorUnits: 2 });
  });
});

describe('arithmetic', () => {
  it('adds and subtracts amounts of the same currency', () => {
    expect(add(money(150n, USD), money(275n, USD))).toEqual(money(425n, USD));
    expect(subtract(money(150n, USD), money(275n, USD))).toEqual(money(-125n, USD));
  });

  it('keeps precision beyond 2^53', () => {
    const big = money(2n ** 53n + 1n, IRR);
    expect(add(big, money(1n, IRR)).amount).toBe(9007199254740994n);
    expect(sum(IRR, [big, big, big]).amount).toBe(27021597764222979n);
  });

  it('sums a list, including an empty one', () => {
    expect(sum(USD, [])).toEqual(money(0n, USD));
    expect(sum(USD, [money(1n, USD), money(2n, USD), money(-4n, USD)])).toEqual(money(-1n, USD));
  });

  it('negates', () => {
    expect(negate(money(5n, USD))).toEqual(money(-5n, USD));
    expect(negate(money(0n, USD))).toEqual(money(0n, USD));
  });

  it('compares and tests equality', () => {
    expect(compare(money(1n, USD), money(2n, USD))).toBe(-1);
    expect(compare(money(2n, USD), money(2n, USD))).toBe(0);
    expect(compare(money(3n, USD), money(2n, USD))).toBe(1);
    expect(equals(money(2n, USD), money(2n, USD))).toBe(true);
    expect(equals(money(2n, USD), money(3n, USD))).toBe(false);
    expect(isZero(money(0n, IRR))).toBe(true);
    expect(isZero(money(-1n, IRR))).toBe(false);
  });

  it('refuses mixed currencies', () => {
    const rial = money(1n, IRR);
    const dollar = money(1n, USD);
    expect(() => add(rial, dollar)).toThrow(CurrencyMismatchError);
    expect(() => subtract(rial, dollar)).toThrow(CurrencyMismatchError);
    expect(() => compare(rial, dollar)).toThrow(CurrencyMismatchError);
    expect(() => equals(rial, dollar)).toThrow(CurrencyMismatchError);
    expect(() => sum(IRR, [rial, dollar])).toThrow(CurrencyMismatchError);
    expect(() => sum(USD, [rial])).toThrow(CurrencyMismatchError);
  });
});

describe('divRound', () => {
  it('rounds half away from zero', () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(5n, -2n)).toBe(-3n);
    expect(divRound(-5n, -2n)).toBe(3n);
    expect(divRound(15n, 10n)).toBe(2n);
    expect(divRound(25n, 10n)).toBe(3n);
  });

  it('rounds non-ties to the nearest integer', () => {
    expect(divRound(14n, 10n)).toBe(1n);
    expect(divRound(16n, 10n)).toBe(2n);
    expect(divRound(-14n, 10n)).toBe(-1n);
    expect(divRound(-16n, 10n)).toBe(-2n);
    expect(divRound(9n, 3n)).toBe(3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(divRound(5n, 3n)).toBe(2n);
    expect(divRound(0n, 7n)).toBe(0n);
  });

  it('refuses division by zero', () => {
    expect(() => divRound(1n, 0n)).toThrow(RangeError);
  });
});
