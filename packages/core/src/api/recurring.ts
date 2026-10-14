import { z } from 'zod';
import { MAX_RECURRENCE_INTERVAL, recurrenceFrequencies } from '../recurring';
import { amountSchema } from '../money';
import { transactionTypes } from '../transactions';
import { idSchema, nameSchema, notEmpty, positiveAmountSchema } from './shared';
import { isoDaySchema } from './transaction';

/** A Recurring Rule as the API returns it. Lists come oldest first. */
export const recurringRuleSchema = z.object({
  id: z.uuid(),
  /** What the user calls it; also the note on the Transactions it makes. */
  name: z.string(),
  /** Only Income and Expense repeat; a Transfer cannot. */
  type: z.enum(transactionTypes),
  accountId: z.uuid(),
  /** A Category of the rule's type. */
  categoryId: z.uuid(),
  /** What each occurrence usually is, in its Account's currency; editable on confirming. */
  amount: amountSchema,
  frequency: z.enum(recurrenceFrequencies),
  /** Every how many weeks, months or years. */
  interval: z.number().int(),
  /** The first occurrence; a monthly or yearly rule keeps its day in the Workspace Calendar. */
  startOn: isoDaySchema,
  /** The last day an occurrence may fall on; null repeats forever. */
  endOn: isoDaySchema.nullable(),
  /** Records each occurrence as it comes due, with no confirmation. */
  autoPost: z.boolean(),
  /** An archived rule stops: nothing of it comes due any more. */
  archived: z.boolean(),
  /** The next occurrence after today, or null once the rule ended or is archived. */
  nextDueOn: isoDaySchema.nullable(),
  version: z.number().int(),
});
export type RecurringRule = z.infer<typeof recurringRuleSchema>;
export type RecurringRuleWire = z.input<typeof recurringRuleSchema>;
export const recurringRuleListSchema = z.array(recurringRuleSchema);

const intervalSchema = z.number().int().min(1).max(MAX_RECURRENCE_INTERVAL);

function endsAfterStart(input: {
  startOn?: string | undefined;
  endOn?: string | null | undefined;
}) {
  return !input.startOn || !input.endOn || input.endOn >= input.startOn;
}
const ENDS_BEFORE_START = { message: 'A rule cannot end before it starts', path: ['endOn'] };

/**
 * Makes a Recurring Rule for an active Account and an active Category of its
 * type. Without `autoPost`, each occurrence waits for confirmation.
 */
export const createRecurringRuleInputSchema = z
  .strictObject({
    /** Chosen by the client (a UUIDv7), so a replayed create makes nothing new (ADR-0005). */
    id: idSchema.exactOptional(),
    name: nameSchema,
    type: z.enum(transactionTypes),
    accountId: idSchema,
    categoryId: idSchema,
    amount: positiveAmountSchema,
    frequency: z.enum(recurrenceFrequencies),
    interval: intervalSchema.default(1),
    startOn: isoDaySchema,
    endOn: isoDaySchema.nullable().default(null),
    autoPost: z.boolean().default(false),
  })
  .refine(endsAfterStart, ENDS_BEFORE_START);
export type ParsedCreateRecurringRuleInput = z.infer<typeof createRecurringRuleInputSchema>;
/** The interval, end and auto-posting may be left out for their defaults. */
export type CreateRecurringRuleInput = Omit<
  ParsedCreateRecurringRuleInput,
  'interval' | 'endOn' | 'autoPost'
> &
  Partial<Pick<ParsedCreateRecurringRuleInput, 'interval' | 'endOn' | 'autoPost'>>;

/**
 * What an Owner or Admin may change on a Recurring Rule; at least one per
 * request. Occurrences already confirmed or skipped stay so; a new schedule
 * brings due whatever of it falls between its start and today.
 */
export const updateRecurringRuleInputSchema = z
  .strictObject({
    name: nameSchema.exactOptional(),
    type: z.enum(transactionTypes).exactOptional(),
    accountId: idSchema.exactOptional(),
    categoryId: idSchema.exactOptional(),
    amount: positiveAmountSchema.exactOptional(),
    frequency: z.enum(recurrenceFrequencies).exactOptional(),
    interval: intervalSchema.exactOptional(),
    startOn: isoDaySchema.exactOptional(),
    endOn: isoDaySchema.nullable().exactOptional(),
    autoPost: z.boolean().exactOptional(),
    archived: z.boolean().exactOptional(),
  })
  .refine(...notEmpty)
  .refine(endsAfterStart, ENDS_BEFORE_START);
export type UpdateRecurringRuleInput = z.infer<typeof updateRecurringRuleInputSchema>;

/** An occurrence of a Recurring Rule that came due and waits for confirmation. */
export const dueOccurrenceSchema = z.object({
  ruleId: z.uuid(),
  /** The day it fell due; the Transaction confirming it happens on that day. */
  dueOn: isoDaySchema,
  name: z.string(),
  type: z.enum(transactionTypes),
  accountId: z.uuid(),
  categoryId: z.uuid(),
  /** The rule's Amount, which confirming may change. */
  amount: amountSchema,
});
export type DueOccurrence = z.infer<typeof dueOccurrenceSchema>;
export type DueOccurrenceWire = z.input<typeof dueOccurrenceSchema>;

/** The Workspace's Due Occurrences, after recording those of auto-posting rules. */
export const dueOccurrencesSchema = z.object({
  /** Oldest first. */
  occurrences: z.array(dueOccurrenceSchema),
  /** How many Transactions auto-posting rules recorded just now. */
  autoPosted: z.number().int(),
});
export type DueOccurrences = z.infer<typeof dueOccurrencesSchema>;
export type DueOccurrencesWire = z.input<typeof dueOccurrencesSchema>;

/** Confirms a Due Occurrence, optionally with another Amount than the rule's. */
export const confirmOccurrenceInputSchema = z.strictObject({
  amount: positiveAmountSchema.exactOptional(),
});
export type ConfirmOccurrenceInput = z.infer<typeof confirmOccurrenceInputSchema>;
