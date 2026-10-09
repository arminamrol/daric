import { divRound, money } from './money';
import type { Currency, Money } from './money';

const RATE = /^(\d+)(?:\.(\d+))?$/;

/**
 * Converts `from` into `to` at `rate` (how many units of `to` one unit of `from` is worth,
 * as a decimal string). Uses integer math and rounds half away from zero once, at the end.
 */
export function convert(from: Money, to: Currency, rate: string): Money {
  const match = RATE.exec(rate);
  if (!match) throw new RangeError(`Invalid exchange rate: ${JSON.stringify(rate)}`);
  const [, whole = '', fraction = ''] = match;
  const rateNumerator = BigInt(whole + fraction);
  if (rateNumerator === 0n) throw new RangeError('Exchange rate must be positive');

  const numerator = from.amount * rateNumerator * 10n ** BigInt(to.minorUnits);
  const denominator = 10n ** BigInt(fraction.length + from.currency.minorUnits);
  return money(divRound(numerator, denominator), to);
}
