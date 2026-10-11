import { describe, expect, it } from 'vitest';
import {
  budgetSchema,
  createBudgetInputSchema,
  listBudgetsQuerySchema,
  updateBudgetInputSchema,
} from './index';

const category = '01900000-0000-7000-B000-000000000001';
const label = '01900000-0000-7000-8c00-000000000001';

describe('createBudgetInputSchema', () => {
  it('takes a Category, a Period and a positive limit; the Label is optional', () => {
    expect(
      createBudgetInputSchema.parse({ categoryId: category, period: 'MONTHLY', amount: '5000' }),
    ).toEqual({
      categoryId: category.toLowerCase(),
      labelId: null,
      period: 'MONTHLY',
      amount: 5000n,
    });
    expect(
      createBudgetInputSchema.parse({
        categoryId: category,
        labelId: label,
        period: 'YEARLY',
        amount: '1',
      }).labelId,
    ).toBe(label);
  });

  it.each([
    ['a zero limit', { categoryId: category, period: 'MONTHLY', amount: '0' }],
    ['a negative limit', { categoryId: category, period: 'MONTHLY', amount: '-5' }],
    ['a limit as a number', { categoryId: category, period: 'MONTHLY', amount: 5 }],
    ['an unknown Period', { categoryId: category, period: 'WEEKLY', amount: '5' }],
    ['no Category', { period: 'MONTHLY', amount: '5' }],
    ['an unknown field', { categoryId: category, period: 'MONTHLY', amount: '5', currency: 'USD' }],
  ])('rejects %s', (_, input) => {
    expect(createBudgetInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('updateBudgetInputSchema', () => {
  it('takes any of the fields, and a null Label to widen to the whole Category', () => {
    expect(updateBudgetInputSchema.parse({ amount: '10', labelId: null })).toEqual({
      amount: 10n,
      labelId: null,
    });
  });

  it.each([
    ['nothing', {}],
    ['a zero limit', { amount: '0' }],
  ])('rejects %s', (_, input) => {
    expect(updateBudgetInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('listBudgetsQuerySchema', () => {
  it('reads a month', () => {
    expect(listBudgetsQuerySchema.parse({ month: '1405-07' })).toEqual({
      month: { kind: 'month', year: 1405, month: 7 },
    });
    expect(listBudgetsQuerySchema.parse({})).toEqual({});
  });

  it('refuses a year or anything else', () => {
    expect(listBudgetsQuerySchema.safeParse({ month: '1405' }).success).toBe(false);
    expect(listBudgetsQuerySchema.safeParse({ month: '1405-13' }).success).toBe(false);
  });
});

describe('budgetSchema', () => {
  it('reads Amounts as bigints and the progress Period as a Period', () => {
    const budget = budgetSchema.parse({
      id: category,
      categoryId: category,
      labelId: null,
      period: 'YEARLY',
      amount: '1000',
      currency: 'IRR',
      version: 1,
      progress: {
        period: '1405',
        spent: '1200',
        remaining: '-200',
        percent: 120,
        state: 'over',
        otherCurrencyExpenses: 0,
      },
    });
    expect(budget.progress).toMatchObject({
      period: { kind: 'year', year: 1405 },
      remaining: -200n,
    });
  });
});
