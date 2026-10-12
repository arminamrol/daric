import { z } from 'zod';
import { amountSchema } from '../money';
import { notEmpty } from './shared';
import { isoDaySchema } from './transaction';

/** An Amount of zero or more. */
const valueSchema = amountSchema.refine((amount) => amount >= 0n, {
  message: 'A value cannot be negative',
});

/** A Valuation as the API returns it; its Amount is in the Account's currency. */
export const valuationSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  amount: amountSchema,
  /** The Account is worth `amount` from this day until its next Valuation. */
  valuedOn: isoDaySchema,
  version: z.number().int(),
});
/** Named apart from core's `Valuation`, which only needs the Amount and day. */
export type AccountValuation = z.infer<typeof valuationSchema>;
export type ValuationWire = z.input<typeof valuationSchema>;
export const valuationListSchema = z.array(valuationSchema);

/** One Valuation per Account and day, in the Account's currency. */
export const createValuationInputSchema = z.strictObject({
  amount: valueSchema,
  valuedOn: isoDaySchema,
});
export type CreateValuationInput = z.infer<typeof createValuationInputSchema>;

/** What an Owner or Admin may change on a Valuation; its Account is fixed. */
export const updateValuationInputSchema = z
  .strictObject({
    amount: valueSchema.exactOptional(),
    valuedOn: isoDaySchema.exactOptional(),
  })
  .refine(...notEmpty);
export type UpdateValuationInput = z.infer<typeof updateValuationInputSchema>;
