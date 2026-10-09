import { z } from 'zod';
import { fitsInt64 } from './money';

/** Amounts travel as decimal integer strings ("1299") because JSON numbers lose precision. */
export function amountToWire(amount: bigint): string {
  return amount.toString();
}

/** Validates a wire Amount and transforms it into a bigint. */
export const amountSchema = z
  .string()
  .regex(/^(0|-?[1-9]\d*)$/, 'Expected a decimal integer string')
  .transform((s) => BigInt(s))
  .refine(fitsInt64, 'Amount does not fit a 64-bit integer');
