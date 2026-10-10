import { z } from 'zod';
import { currencies } from '../money';

export const currencyCodes = currencies.map((c) => c.code);

/** A code of a currency Daric knows (the `currencies` table holds the same list). */
export const currencyCodeSchema = z
  .string()
  .refine((code) => currencyCodes.includes(code), { message: 'Unsupported currency' });

/** A partial update must change something. */
export const notEmpty = [
  (input: object) => Object.keys(input).length > 0,
  { message: 'Nothing to update' },
] as const;

/** A name a person gives something (an Account, a Category, a Label). */
export const nameSchema = z.string().trim().min(1).max(100);
