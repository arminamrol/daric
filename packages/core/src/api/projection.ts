import { z } from 'zod';
import { amountSchema } from '../money';
import { MAX_TRAILING_MONTHS, plannedItemKinds, projectionModes } from '../projection';
import { transactionTypes } from '../transactions';
import { rateUsedSchema } from './exchange-rate';
import { monthParamSchema, notEmpty } from './shared';
import { isoDaySchema } from './transaction';

/** How the Workspace's Projection is worked out. */
export const projectionSettingsSchema = z.object({
  /** N: how many closed months the Trailing Average looks back over. */
  trailingMonths: z.number().int(),
  /** The mode the Projection is shown in unless another is asked for. */
  mode: z.enum(projectionModes),
  version: z.number().int(),
});
export type ProjectionSettings = z.infer<typeof projectionSettingsSchema>;

/** What an Owner or Admin may change on the Projection settings; at least one per request. */
export const updateProjectionSettingsInputSchema = z
  .strictObject({
    trailingMonths: z.number().int().min(1).max(MAX_TRAILING_MONTHS).exactOptional(),
    mode: z.enum(projectionModes).exactOptional(),
  })
  .refine(...notEmpty);
export type UpdateProjectionSettingsInput = z.infer<typeof updateProjectionSettingsInputSchema>;

/** One type's or one Category's figures, in the Base Currency. */
export const projectionFiguresSchema = z.object({
  /** What happened from the start of the year up to and including today. */
  actual: amountSchema,
  /** The Trailing Average of variable (non-recurring) amounts per month. */
  average: amountSchema,
  /** The Trailing Average times the months left, rounded once. */
  variable: amountSchema,
  /** What Recurring Rules bring after today up to the year end. */
  recurring: amountSchema,
  /** What Planned Items bring after today up to the year end. */
  planned: amountSchema,
  /** actual + variable + recurring + planned; a mode leaves out what it does not use. */
  projected: amountSchema,
});
export type ProjectionFiguresWire = z.input<typeof projectionFiguresSchema>;

export const categoryProjectionSchema = projectionFiguresSchema.extend({
  /** Null only for One-Off Planned Items with no Category. */
  categoryId: z.uuid().nullable(),
  type: z.enum(transactionTypes),
});

/** A Recurring Rule's part in the Projection. */
export const recurringAssumptionSchema = z.object({
  ruleId: z.uuid(),
  name: z.string(),
  type: z.enum(transactionTypes),
  categoryId: z.uuid(),
  /** Its occurrences after today up to the year end. */
  occurrences: z.array(isoDaySchema),
  /** Their Amounts added up, in the Base Currency. */
  total: amountSchema,
});

/** A Planned Item's part in the Projection. */
export const plannedAssumptionSchema = z.object({
  itemId: z.uuid(),
  name: z.string(),
  kind: z.enum(plannedItemKinds),
  type: z.enum(transactionTypes),
  categoryId: z.uuid().nullable(),
  /** Its occurrences after today up to the year end. */
  occurrences: z.array(isoDaySchema),
  /** Their Amounts added up, in the Base Currency. */
  total: amountSchema,
});

export const projectionWarningSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('short_history'),
    monthsUsed: z.number().int(),
    monthsWanted: z.number().int(),
  }),
  z.object({ kind: z.literal('no_history'), monthsWanted: z.number().int() }),
  z.object({ kind: z.literal('missing_rates'), currencies: z.array(z.string()) }),
]);
export type ProjectionWarningWire = z.infer<typeof projectionWarningSchema>;

/**
 * The Projection of the current Workspace-Calendar year in one mode, with
 * every assumption behind it, per type and per Category, in the Base Currency.
 * Automatic: actual + round(average × months left) + recurring. Manual:
 * actual + planned. Combined: per Category a Fixed Monthly Planned Item over
 * Recurring Rules over the average, One-Off Planned Items added.
 */
export const projectionSchema = z.object({
  mode: z.enum(projectionModes),
  year: z.number().int(),
  today: isoDaySchema,
  /** The year's last day. */
  yearEnd: isoDaySchema,
  baseCurrency: z.string(),
  /** Months left = fullMonths + daysLeftInMonth / daysInMonth. */
  remaining: z.object({
    daysLeftInMonth: z.number().int(),
    daysInMonth: z.number().int(),
    fullMonths: z.number().int(),
  }),
  /** The closed months the Trailing Average looks back over (`1405-04`), oldest first. */
  window: z.array(monthParamSchema),
  /** How many of the window's latest months had history and were averaged. */
  monthsUsed: z.number().int(),
  income: projectionFiguresSchema,
  expense: projectionFiguresSchema,
  /** The type totals are the sums of these. */
  categories: z.array(categoryProjectionSchema),
  /** Active Recurring Rules counted, with occurrences left this year, oldest rule first. */
  recurring: z.array(recurringAssumptionSchema),
  /** Planned Items counted, with occurrences left this year, oldest first. */
  planned: z.array(plannedAssumptionSchema),
  ratesUsed: z.array(rateUsedSchema),
  /** Currencies with Amounts but no rate; those Amounts are left out. */
  missing: z.array(z.string()),
  warnings: z.array(projectionWarningSchema),
});
export type ProjectionWire = z.input<typeof projectionSchema>;
export type ProjectionReport = z.infer<typeof projectionSchema>;

/** Which mode to work the Projection out in; the Workspace's setting by default. */
export const projectionQuerySchema = z.object({
  mode: z.enum(projectionModes).exactOptional(),
});
export type ProjectionQuery = z.infer<typeof projectionQuerySchema>;
