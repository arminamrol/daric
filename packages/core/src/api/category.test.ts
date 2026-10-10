import { describe, expect, it } from 'vitest';
import {
  createCategoryInputSchema,
  reorderCategoriesInputSchema,
  updateCategoryInputSchema,
} from './index';

const valid = { kind: 'EXPENSE', name: ' خوراک ', icon: 'utensils', color: 'orange' };
const uuid = '01900000-0000-7000-8000-000000000001';

describe('createCategoryInputSchema', () => {
  it('trims the name and makes a top-level Category by default', () => {
    expect(createCategoryInputSchema.parse(valid)).toEqual({
      ...valid,
      name: 'خوراک',
      parentId: null,
    });
    expect(createCategoryInputSchema.parse({ ...valid, parentId: uuid }).parentId).toBe(uuid);
  });

  it.each([
    ['an empty name', { name: ' ' }],
    ['an unknown kind', { kind: 'TRANSFER' }],
    ['an unknown icon', { icon: 'rocket-ship' }],
    ['an unknown color', { color: '#ff0000' }],
    ['a parent id that is not a uuid', { parentId: 'food' }],
  ])('rejects %s', (_, change) => {
    expect(createCategoryInputSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});

describe('updateCategoryInputSchema', () => {
  it('takes any non-empty subset, including moving to the top level', () => {
    expect(updateCategoryInputSchema.parse({ parentId: null })).toEqual({ parentId: null });
    expect(updateCategoryInputSchema.parse({ archived: true })).toEqual({ archived: true });
    expect(updateCategoryInputSchema.safeParse({}).success).toBe(false);
  });

  it('does not change the kind', () => {
    expect(updateCategoryInputSchema.safeParse({ kind: 'INCOME' }).success).toBe(false);
  });
});

describe('reorderCategoriesInputSchema', () => {
  it('takes distinct ids', () => {
    expect(reorderCategoriesInputSchema.parse({ ids: [uuid] })).toEqual({ ids: [uuid] });
    expect(reorderCategoriesInputSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(reorderCategoriesInputSchema.safeParse({ ids: [uuid, uuid] }).success).toBe(false);
  });
});
