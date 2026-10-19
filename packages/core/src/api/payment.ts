import { z } from 'zod';
import { amountSchema } from '../money';

/** How many months of Plus one Payment may buy. */
export const plusMonthsSchema = z.number().int().min(1).max(12);

/** What a number of months of Plus costs, as the server prices it; clients never send a price. */
export const plusPriceSchema = z.object({
  months: plusMonthsSchema,
  /** The monthly price times the months, before the discount. */
  fullAmount: amountSchema,
  /** What the User pays. */
  amount: amountSchema,
  currency: z.string(),
  /** The tiered discount as a whole percent; 0 when none applies. */
  discountPercent: z.number().int().min(0).max(100),
});
export type PlusPrice = z.infer<typeof plusPriceSchema>;
export type PlusPriceWire = z.input<typeof plusPriceSchema>;
/** One price per number of months, 1 to 12. */
export const plusPriceListSchema = z.array(plusPriceSchema);

/** Starts buying Plus: only how many months; the server works out the price. */
export const checkoutInputSchema = z.object({ months: plusMonthsSchema });
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

/**
 * Pending while the User is at the payment provider; Paid once the provider
 * confirmed it and the Subscription was extended; Canceled when the User
 * turned back; Failed when the provider refused it or never confirmed it.
 */
export const paymentStatuses = ['PENDING', 'PAID', 'FAILED', 'CANCELED'] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

/** One purchase of Plus months. */
export const paymentSchema = z.object({
  id: z.uuid(),
  months: plusMonthsSchema,
  amount: amountSchema,
  currency: z.string(),
  status: z.enum(paymentStatuses),
  /** The provider's reference number for a Paid one, to quote to its support. */
  receipt: z.string().nullable(),
  /** When Plus runs until after this Payment; set once Paid. */
  plusUntil: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /** When it was Paid, Failed or Canceled. */
  completedAt: z.iso.datetime().nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;
export type PaymentWire = z.input<typeof paymentSchema>;
/** Newest first; Pending ones are left out. */
export const paymentListSchema = z.array(paymentSchema);

/** A Pending Payment and the provider's page the browser goes to next. */
export const checkoutSchema = z.object({
  payment: paymentSchema,
  redirectUrl: z.url(),
});
export type Checkout = z.infer<typeof checkoutSchema>;
