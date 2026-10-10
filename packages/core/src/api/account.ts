import { z } from 'zod';
import { accountClasses, accountTypes } from '../accounts';
import { amountSchema, currencies } from '../money';
import { notEmpty } from './partial';

export const accountCurrencyCodes = currencies.map((c) => c.code);

const nameSchema = z.string().trim().min(1).max(100);

/** An Account as the API returns it; Amounts are in the Account's currency. */
export const accountSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(accountTypes),
  class: z.enum(accountClasses),
  currency: z.string(),
  openingBalance: amountSchema,
  /** The opening balance plus the effect of the Account's Transactions. */
  balance: amountSchema,
  /** Archived Accounts keep their history but are hidden from lists by default. */
  archived: z.boolean(),
});
export type Account = z.infer<typeof accountSchema>;
export const accountListSchema = z.array(accountSchema);

/** An Account as it travels in JSON, Amounts as decimal strings. */
export type AccountWire = z.input<typeof accountSchema>;

export const createAccountInputSchema = z.object({
  name: nameSchema,
  type: z.enum(accountTypes),
  class: z.enum(accountClasses),
  currency: z
    .string()
    .refine((code) => accountCurrencyCodes.includes(code), { message: 'Unsupported currency' }),
  openingBalance: amountSchema,
});
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

/**
 * What an Owner or Admin may change on an Account; at least one per request.
 * The currency is fixed once created: its Amounts would mean something else.
 */
export const updateAccountInputSchema = z
  .strictObject({
    name: nameSchema.exactOptional(),
    type: z.enum(accountTypes).exactOptional(),
    class: z.enum(accountClasses).exactOptional(),
    openingBalance: amountSchema.exactOptional(),
    archived: z.boolean().exactOptional(),
  })
  .refine(...notEmpty);
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;
