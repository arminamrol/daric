import { z } from 'zod';
import { RATE_MAX_DECIMALS, RATE_MAX_WHOLE_DIGITS, canonicalRate } from '../rates';
import { currencyCodeSchema, notEmpty } from './shared';
import { isoDaySchema } from './transaction';

const RATE = new RegExp(`^\\d{1,${RATE_MAX_WHOLE_DIGITS}}(\\.\\d{1,${RATE_MAX_DECIMALS}})?$`);

/**
 * A rate as a plain decimal string ("1050000.5"): units of the Base Currency
 * per one unit of the currency. Positive; needless zeros are dropped.
 */
export const rateSchema = z
  .string()
  .regex(RATE, 'Expected a decimal rate such as 1050000.5')
  .refine((rate) => /[1-9]/.test(rate), { message: 'A rate must be positive' })
  .transform(canonicalRate);

/** An Exchange Rate as the API returns it, into the Workspace's current Base Currency. */
export const exchangeRateSchema = z.object({
  id: z.uuid(),
  /** The currency converted from; never the Base Currency. */
  currency: z.string(),
  rate: z.string(),
  /** In force from this day until the currency's next rate. */
  effectiveOn: isoDaySchema,
  version: z.number().int(),
});
export type ExchangeRateWire = z.infer<typeof exchangeRateSchema>;
export const exchangeRateListSchema = z.array(exchangeRateSchema);

/** One rate per currency and day, into the Base Currency the Workspace has now. */
export const createExchangeRateInputSchema = z.strictObject({
  currency: currencyCodeSchema,
  rate: rateSchema,
  effectiveOn: isoDaySchema,
});
export type CreateExchangeRateInput = z.infer<typeof createExchangeRateInputSchema>;

/** What an Owner or Admin may change on a rate; its currency is fixed. */
export const updateExchangeRateInputSchema = z
  .strictObject({
    rate: rateSchema.exactOptional(),
    effectiveOn: isoDaySchema.exactOptional(),
  })
  .refine(...notEmpty);
export type UpdateExchangeRateInput = z.infer<typeof updateExchangeRateInputSchema>;
