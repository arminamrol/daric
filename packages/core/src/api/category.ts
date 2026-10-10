import { z } from 'zod';
import { categoryColors, categoryIcons, categoryKinds } from '../categories';
import { nameSchema, notEmpty } from './shared';

/** A Category as the API returns it. Lists come ordered by `position` within each parent. */
export const categorySchema = z.object({
  id: z.uuid(),
  kind: z.enum(categoryKinds),
  /** A top-level Category of the same kind, or null for a top-level one. */
  parentId: z.uuid().nullable(),
  name: z.string(),
  icon: z.enum(categoryIcons),
  color: z.enum(categoryColors),
  /** The place among its siblings, from 0. */
  position: z.number().int(),
  /** Archived Categories stay on old Transactions but are hidden from lists by default. */
  archived: z.boolean(),
});
export type Category = z.infer<typeof categorySchema>;
export const categoryListSchema = z.array(categorySchema);

export const createCategoryInputSchema = z.object({
  kind: z.enum(categoryKinds),
  parentId: z.uuid().nullable().default(null),
  name: nameSchema,
  icon: z.enum(categoryIcons),
  color: z.enum(categoryColors),
});
export type CreateCategoryInput = z.input<typeof createCategoryInputSchema>;

/**
 * What an Owner or Admin may change on a Category; at least one per request.
 * The kind is fixed once created. A new parent puts the Category last among
 * its new siblings.
 */
export const updateCategoryInputSchema = z
  .strictObject({
    parentId: z.uuid().nullable().exactOptional(),
    name: nameSchema.exactOptional(),
    icon: z.enum(categoryIcons).exactOptional(),
    color: z.enum(categoryColors).exactOptional(),
    archived: z.boolean().exactOptional(),
  })
  .refine(...notEmpty);
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;

/**
 * The new order of the Categories of one kind under one parent (or at the top
 * level): every one of them, archived ones included.
 */
export const reorderCategoriesInputSchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Ids must be distinct' }),
});
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesInputSchema>;
