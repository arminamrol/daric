import { z } from 'zod';
import { nameSchema, notEmpty } from './shared';

/** A Label as the API returns it. Lists come ordered by name. */
export const labelSchema = z.object({
  id: z.uuid(),
  /** Unique in its Workspace, ignoring case. */
  name: z.string(),
  /** A Controllable Label marks spending the user could reduce. */
  controllable: z.boolean(),
  /** Archived Labels stay on old Transactions but cannot be attached to more. */
  archived: z.boolean(),
});
export type Label = z.infer<typeof labelSchema>;
export const labelListSchema = z.array(labelSchema);

export const createLabelInputSchema = z.strictObject({
  name: nameSchema,
  controllable: z.boolean().default(false),
});
export type CreateLabelInput = z.input<typeof createLabelInputSchema>;

/** What an Owner or Admin may change on a Label; at least one per request. */
export const updateLabelInputSchema = z
  .strictObject({
    name: nameSchema.exactOptional(),
    controllable: z.boolean().exactOptional(),
    archived: z.boolean().exactOptional(),
  })
  .refine(...notEmpty);
export type UpdateLabelInput = z.infer<typeof updateLabelInputSchema>;
