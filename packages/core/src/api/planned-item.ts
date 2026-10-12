import { z } from 'zod';
import { amountSchema } from '../money';
import { plannedItemKinds } from '../projection';
import { transactionTypes } from '../transactions';
import { idSchema, nameSchema, notEmpty, positiveAmountSchema } from './shared';
import { isoDaySchema } from './transaction';

/** A Planned Item as the API returns it. Lists come oldest first. */
export const plannedItemSchema = z.object({
  id: z.uuid(),
  /** What the user calls it, e.g. rent or car insurance. */
  name: z.string(),
  /** Fixed Monthly, every month on its start's day, or One-Off, once on that day. */
  kind: z.enum(plannedItemKinds),
  type: z.enum(transactionTypes),
  /** A Category of the item's type; a Fixed Monthly item always has one. */
  categoryId: z.uuid().nullable(),
  /** Per month for a Fixed Monthly item, in `currency`. */
  amount: amountSchema,
  /** The Workspace's Base Currency when the item was made. */
  currency: z.string(),
  /** A One-Off's day, or a Fixed Monthly's first; its day in the Workspace Calendar repeats. */
  startOn: isoDaySchema,
  /** A Fixed Monthly's last day; null runs on. Always null for a One-Off. */
  endOn: isoDaySchema.nullable(),
  version: z.number().int(),
});
export type PlannedItem = z.infer<typeof plannedItemSchema>;
export type PlannedItemWire = z.input<typeof plannedItemSchema>;
export const plannedItemListSchema = z.array(plannedItemSchema);

export const FIXED_NEEDS_CATEGORY = 'A Fixed Monthly Planned Item needs a Category';
export const ONE_OFF_HAS_NO_END = 'A One-Off Planned Item has no end';
export const ENDS_BEFORE_START = 'A Planned Item cannot end before it starts';

/** Why a Planned Item's fields do not fit together, or null when they do. */
export function plannedItemProblem(item: {
  kind: (typeof plannedItemKinds)[number];
  categoryId: string | null;
  startOn: string;
  endOn: string | null;
}): string | null {
  if (item.kind === 'FIXED_MONTHLY' && item.categoryId === null) return FIXED_NEEDS_CATEGORY;
  if (item.kind === 'ONE_OFF' && item.endOn !== null) return ONE_OFF_HAS_NO_END;
  if (item.endOn !== null && item.endOn < item.startOn) return ENDS_BEFORE_START;
  return null;
}

/**
 * Makes a Planned Item, in the Workspace's Base Currency. A Fixed Monthly one
 * needs an active Category of its type; a One-Off may have one.
 */
export const createPlannedItemInputSchema = z
  .strictObject({
    name: nameSchema,
    kind: z.enum(plannedItemKinds),
    type: z.enum(transactionTypes),
    categoryId: idSchema.nullable().default(null),
    amount: positiveAmountSchema,
    startOn: isoDaySchema,
    endOn: isoDaySchema.nullable().default(null),
  })
  .superRefine((input, ctx) => {
    const problem = plannedItemProblem(input);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });
export type ParsedCreatePlannedItemInput = z.infer<typeof createPlannedItemInputSchema>;
/** The Category and end may be left out. */
export type CreatePlannedItemInput = Omit<ParsedCreatePlannedItemInput, 'categoryId' | 'endOn'> &
  Partial<Pick<ParsedCreatePlannedItemInput, 'categoryId' | 'endOn'>>;

/**
 * What an Owner or Admin may change on a Planned Item; at least one per
 * request. Its kind and type stay as made.
 */
export const updatePlannedItemInputSchema = z
  .strictObject({
    name: nameSchema.exactOptional(),
    categoryId: idSchema.nullable().exactOptional(),
    amount: positiveAmountSchema.exactOptional(),
    startOn: isoDaySchema.exactOptional(),
    endOn: isoDaySchema.nullable().exactOptional(),
  })
  .refine(...notEmpty);
export type UpdatePlannedItemInput = z.infer<typeof updatePlannedItemInputSchema>;
