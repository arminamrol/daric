import { describe, expect, it } from 'vitest';
import {
  createPlannedItemInputSchema,
  projectionQuerySchema,
  updatePlannedItemInputSchema,
  updateProjectionSettingsInputSchema,
} from './index';

const category = '01900000-0000-7000-B000-000000000001';
const rent = {
  name: 'Rent',
  kind: 'FIXED_MONTHLY',
  type: 'EXPENSE',
  categoryId: category,
  amount: '250000000',
  startOn: '2026-10-23',
};

describe('createPlannedItemInputSchema', () => {
  it('takes a Fixed Monthly item with a Category, running on with no end', () => {
    expect(createPlannedItemInputSchema.parse(rent)).toEqual({
      ...rent,
      categoryId: category.toLowerCase(),
      amount: 250000000n,
      endOn: null,
    });
  });

  it('takes a One-Off with no Category', () => {
    const insurance = { ...rent, kind: 'ONE_OFF', categoryId: null };
    expect(createPlannedItemInputSchema.parse(insurance).categoryId).toBeNull();
    const { categoryId: _, ...noCategory } = insurance;
    expect(createPlannedItemInputSchema.parse(noCategory).categoryId).toBeNull();
  });

  it('refuses a Fixed Monthly with no Category, a One-Off with an end, and an end before the start', () => {
    expect(createPlannedItemInputSchema.safeParse({ ...rent, categoryId: null }).success).toBe(
      false,
    );
    expect(
      createPlannedItemInputSchema.safeParse({ ...rent, kind: 'ONE_OFF', endOn: '2026-12-01' })
        .success,
    ).toBe(false);
    expect(createPlannedItemInputSchema.safeParse({ ...rent, endOn: '2026-10-22' }).success).toBe(
      false,
    );
    expect(createPlannedItemInputSchema.safeParse({ ...rent, amount: '0' }).success).toBe(false);
    expect(createPlannedItemInputSchema.safeParse({ ...rent, type: 'TRANSFER' }).success).toBe(
      false,
    );
  });
});

describe('updatePlannedItemInputSchema', () => {
  it('needs something to change and keeps the kind and type', () => {
    expect(updatePlannedItemInputSchema.safeParse({}).success).toBe(false);
    expect(updatePlannedItemInputSchema.safeParse({ kind: 'ONE_OFF' }).success).toBe(false);
    expect(updatePlannedItemInputSchema.parse({ amount: '5', endOn: null })).toEqual({
      amount: 5n,
      endOn: null,
    });
  });
});

describe('Projection modes', () => {
  it('may be asked for, and set alone or with the trailing months', () => {
    expect(projectionQuerySchema.parse({})).toEqual({});
    expect(projectionQuerySchema.parse({ mode: 'MANUAL' })).toEqual({ mode: 'MANUAL' });
    expect(projectionQuerySchema.safeParse({ mode: 'GUESS' }).success).toBe(false);
    expect(updateProjectionSettingsInputSchema.parse({ mode: 'COMBINED' })).toEqual({
      mode: 'COMBINED',
    });
    expect(updateProjectionSettingsInputSchema.safeParse({}).success).toBe(false);
  });
});
