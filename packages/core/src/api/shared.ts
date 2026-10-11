import { z } from 'zod';
import type { MonthPeriod, Period } from '../calendar';
import { amountSchema, currencies } from '../money';

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

/** Ids are lowercased, as the database writes them, so they compare as text. */
export const idSchema = z.uuid().transform((id) => id.toLowerCase());

/** A name a person gives something (an Account, a Category, a Label). */
export const nameSchema = z.string().trim().min(1).max(100);

/** An Amount above zero. */
export const positiveAmountSchema = amountSchema.refine((amount) => amount > 0n, {
  message: 'An Amount must be positive',
});

// Year 0 does not exist on either calendar.
const PERIOD_PARAM = /^(?!0000)(\d{4})(?:-(0[1-9]|1[0-2]))?$/;

/** A Period as a query parameter: `1405-07` for a month, `1405` for a year. */
export function periodParam(period: Period): string {
  return period.kind === 'month'
    ? `${period.year}-${String(period.month).padStart(2, '0')}`
    : String(period.year);
}

/** A Period written as `periodParam` writes it, read back into a Period. */
export const periodParamSchema = z.string().transform((value, ctx): Period => {
  const match = PERIOD_PARAM.exec(value);
  if (!match) {
    ctx.addIssue({ code: 'custom', message: 'Expected a period as YYYY or YYYY-MM' });
    return z.NEVER;
  }
  const year = Number(match[1]);
  return match[2] ? { kind: 'month', year, month: Number(match[2]) } : { kind: 'year', year };
});

/** A month of the Workspace Calendar as a query parameter, e.g. `1405-07`. */
export const monthParamSchema = periodParamSchema.transform((period, ctx): MonthPeriod => {
  if (period.kind === 'month') return period;
  ctx.addIssue({ code: 'custom', message: 'Expected a month as YYYY-MM' });
  return z.NEVER;
});
