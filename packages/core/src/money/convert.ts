import { divRound, fitsInt64, money } from './money';
import type { Currency, Money } from './money';

const RATE = /^(\d+)(?:\.(\d+))?$/;

/** `from` at `rate` in `to`'s minor unit, exactly: `numerator / 10^scale`, not yet rounded. */
export interface ExactConversion {
  readonly numerator: bigint;
  readonly scale: number;
}

/** What `convert` computes before rounding, so several conversions can be added and rounded once. */
export function convertExactly(from: Money, to: Currency, rate: string): ExactConversion {
  const match = RATE.exec(rate);
  if (!match) throw new RangeError(`Invalid exchange rate: ${JSON.stringify(rate)}`);
  const [, whole = '', fraction = ''] = match;
  const rateNumerator = BigInt(whole + fraction);
  if (rateNumerator === 0n) throw new RangeError('Exchange rate must be positive');
  return {
    numerator: from.amount * rateNumerator * 10n ** BigInt(to.minorUnits),
    scale: fraction.length + from.currency.minorUnits,
  };
}

/**
 * Converts `from` into `to` at `rate` (how many units of `to` one unit of `from` is worth,
 * as a decimal string). Uses integer math and rounds half away from zero once, at the end.
 */
export function convert(from: Money, to: Currency, rate: string): Money {
  const { numerator, scale } = convertExactly(from, to, rate);
  const amount = divRound(numerator, 10n ** BigInt(scale));
  if (!fitsInt64(amount)) throw new RangeError('Converted amount does not fit a 64-bit integer');
  return money(amount, to);
}
