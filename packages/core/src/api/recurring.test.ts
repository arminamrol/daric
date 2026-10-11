import { describe, expect, it } from 'vitest';
import {
  confirmOccurrenceInputSchema,
  createRecurringRuleInputSchema,
  dueOccurrencesSchema,
  recurringRuleSchema,
  updateRecurringRuleInputSchema,
} from './index';

const account = '01900000-0000-7000-8A00-000000000001';
const category = '01900000-0000-7000-B000-000000000001';
const rent = {
  name: 'Rent',
  type: 'EXPENSE',
  accountId: account,
  categoryId: category,
  amount: '250000000',
  frequency: 'MONTHLY',
  startOn: '2026-10-23',
};

describe('createRecurringRuleInputSchema', () => {
  it('takes a name, an Income or Expense, a schedule and a positive Amount', () => {
    expect(createRecurringRuleInputSchema.parse(rent)).toEqual({
      ...rent,
      accountId: account.toLowerCase(),
      categoryId: category.toLowerCase(),
      amount: 250000000n,
      interval: 1,
      endOn: null,
      autoPost: false,
    });
    expect(
      createRecurringRuleInputSchema.parse({
        ...rent,
        frequency: 'WEEKLY',
        interval: 2,
        endOn: '2026-10-23',
        autoPost: true,
      }),
    ).toMatchObject({ interval: 2, endOn: '2026-10-23', autoPost: true });
  });

  it.each([
    ['a Transfer', { ...rent, type: 'TRANSFER' }],
    ['a zero Amount', { ...rent, amount: '0' }],
    ['an unknown frequency', { ...rent, frequency: 'DAILY' }],
    ['a zero interval', { ...rent, interval: 0 }],
    ['an interval above 52', { ...rent, interval: 53 }],
    ['a fractional interval', { ...rent, interval: 1.5 }],
    ['a day that does not exist', { ...rent, startOn: '2026-02-30' }],
    ['an end before the start', { ...rent, endOn: '2026-10-22' }],
    ['an empty name', { ...rent, name: '  ' }],
    ['an unknown field', { ...rent, currency: 'USD' }],
  ])('rejects %s', (_, input) => {
    expect(createRecurringRuleInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('updateRecurringRuleInputSchema', () => {
  it('takes any non-empty subset, archiving included', () => {
    expect(updateRecurringRuleInputSchema.parse({ amount: '5', archived: true })).toEqual({
      amount: 5n,
      archived: true,
    });
    expect(updateRecurringRuleInputSchema.parse({ endOn: null })).toEqual({ endOn: null });
    expect(updateRecurringRuleInputSchema.safeParse({}).success).toBe(false);
    expect(
      updateRecurringRuleInputSchema.safeParse({ startOn: '2026-10-23', endOn: '2026-10-01' })
        .success,
    ).toBe(false);
  });
});

describe('confirmOccurrenceInputSchema', () => {
  it('takes an optional positive Amount in place of the rule’s', () => {
    expect(confirmOccurrenceInputSchema.parse({})).toEqual({});
    expect(confirmOccurrenceInputSchema.parse({ amount: '7' })).toEqual({ amount: 7n });
    expect(confirmOccurrenceInputSchema.safeParse({ amount: '0' }).success).toBe(false);
  });
});

describe('wire schemas', () => {
  it('read Amounts as bigints', () => {
    const rule = {
      ...rent,
      id: '01900000-0000-7000-8000-0000000000e1',
      interval: 1,
      endOn: null,
      autoPost: false,
      archived: false,
      nextDueOn: '2026-10-23',
      version: 1,
    };
    expect(recurringRuleSchema.parse(rule).amount).toBe(250000000n);
    const due = dueOccurrencesSchema.parse({
      occurrences: [
        {
          ruleId: rule.id,
          dueOn: '2026-09-23',
          name: 'Rent',
          type: 'EXPENSE',
          accountId: account,
          categoryId: category,
          amount: '250000000',
        },
      ],
      autoPosted: 0,
    });
    expect(due.occurrences[0]?.amount).toBe(250000000n);
  });
});
