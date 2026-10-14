import type { Category } from '@daric/core';
import { IRR, USD } from '@daric/core';
import { describe, expect, it } from 'vitest';
import { readAccountDraft } from '../accounts/form';
import { readBudgetDraft } from '../budgets/form';
import { archiveProblem, parentChoices, readCategoryDraft } from '../categories/form';
import { readLabelDraft } from '../labels/form';
import { readValuationDraft } from '../net-worth/form';
import { readPlannedItemDraft } from '../projection/form';
import type { PlannedItemDraft } from '../projection/form';
import { readRuleDraft } from '../recurring/form';
import type { RuleDraft } from '../recurring/form';
import { readAmount } from './amount';
import { changedFields } from './changes';

const money = { currency: IRR, moneyDisplay: 'rial' } as const;

describe('readAmount', () => {
  it('reads Persian digits in the shown unit', () => {
    expect(readAmount('۲۵۰٬۰۰۰', money)).toEqual({ ok: true, amount: 250_000n });
    expect(readAmount('25000', { ...money, moneyDisplay: 'toman' })).toEqual({
      ok: true,
      amount: 250_000n,
    });
  });

  it('takes nothing as zero unless an Amount is required', () => {
    expect(readAmount(' ', money)).toEqual({ ok: true, amount: 0n });
    expect(readAmount('', money, { required: 'budgets.error.amountRequired' })).toEqual({
      ok: false,
      error: 'budgets.error.amountRequired',
    });
  });

  it('refuses zero or less when it must be positive, and malformed or too precise ones', () => {
    const positive = { positive: 'transactions.error.amountPositive' } as const;
    expect(readAmount('0', money, positive)).toEqual({
      ok: false,
      error: 'transactions.error.amountPositive',
    });
    expect(readAmount('-5', money)).toEqual({ ok: true, amount: -5n });
    expect(readAmount('abc', money)).toEqual({ ok: false, error: 'accounts.error.amountInvalid' });
    expect(readAmount('1.234', { ...money, currency: USD })).toEqual({
      ok: false,
      error: 'accounts.error.amountTooPrecise',
    });
  });
});

describe('changedFields', () => {
  it('keeps only the fields that differ, so the audit log names real changes', () => {
    expect(
      changedFields({ name: 'a', amount: 5n, endOn: null }, { name: 'a', amount: 6n, endOn: null }),
    ).toEqual({ amount: 6n });
  });
});

describe('readAccountDraft', () => {
  const draft = {
    name: '  Melli ',
    type: 'BANK',
    class: 'ASSET',
    currency: 'IRR',
    openingBalance: '',
  } as const;

  it('reads the fields, an empty opening balance as zero', () => {
    expect(readAccountDraft(draft, 'rial')).toEqual({
      ok: true,
      fields: { name: 'Melli', type: 'BANK', class: 'ASSET', currency: 'IRR', openingBalance: 0n },
    });
  });

  it('says what is wrong', () => {
    expect(readAccountDraft({ ...draft, name: ' ', openingBalance: 'x' }, 'rial')).toEqual({
      ok: false,
      errors: {
        name: 'accounts.error.nameRequired',
        openingBalance: 'accounts.error.amountInvalid',
      },
    });
  });
});

describe('readLabelDraft', () => {
  it('trims the name and requires one', () => {
    expect(readLabelDraft({ name: ' Trip ', controllable: true })).toEqual({
      ok: true,
      fields: { name: 'Trip', controllable: true },
    });
    expect(readLabelDraft({ name: '', controllable: false })).toEqual({
      ok: false,
      errors: { name: 'labels.error.nameRequired' },
    });
  });
});

const category = (id: string, fields: Partial<Category> = {}): Category => ({
  id,
  kind: 'EXPENSE',
  parentId: null,
  name: id,
  icon: 'utensils',
  color: 'red',
  position: 0,
  archived: false,
  ...fields,
});

describe('Category forms', () => {
  const food = category('food');
  const bread = category('bread', { parentId: 'food' });
  const old = category('old', { archived: true });
  const salary = category('salary', { kind: 'INCOME' });
  const all = [food, bread, old, salary];

  it('reads the fields and requires a name', () => {
    const draft = {
      kind: 'EXPENSE',
      parentId: null,
      name: ' Home ',
      icon: 'home',
      color: 'brown',
    } as const;
    expect(readCategoryDraft(draft)).toEqual({ ok: true, fields: { ...draft, name: 'Home' } });
    expect(readCategoryDraft({ ...draft, name: '' })).toEqual({
      ok: false,
      errors: { name: 'categories.error.nameRequired' },
    });
  });

  it('offers active top-level parents of the same kind, and the archived one it has', () => {
    expect(parentChoices(all, 'EXPENSE', undefined).map((c) => c.id)).toEqual(['food']);
    const underOld = category('x', { parentId: 'old' });
    expect(parentChoices([...all, underOld], 'EXPENSE', underOld).map((c) => c.id)).toEqual([
      'food',
      'old',
    ]);
    // A Category with children has no parent to pick.
    expect(parentChoices(all, 'EXPENSE', food)).toEqual([]);
  });

  it('says why archiving or bringing back would be refused', () => {
    expect(archiveProblem(food, all)).toBe('categories.error.archiveChildrenFirst');
    expect(archiveProblem(bread, all)).toBeUndefined();
    const underOld = category('x', { parentId: 'old', archived: true });
    expect(archiveProblem(underOld, [...all, underOld])).toBe('categories.error.parentArchived');
  });
});

describe('readBudgetDraft', () => {
  const draft = { categoryId: 'food', labelId: null, period: 'MONTHLY', amount: '500' } as const;

  it('reads the fields', () => {
    expect(readBudgetDraft(draft, money)).toEqual({
      ok: true,
      fields: { categoryId: 'food', labelId: null, period: 'MONTHLY', amount: 500n },
    });
  });

  it('requires a Category and a positive limit', () => {
    expect(readBudgetDraft({ ...draft, categoryId: undefined, amount: '0' }, money)).toEqual({
      ok: false,
      errors: { category: 'budgets.error.category', amount: 'budgets.error.amountPositive' },
    });
    expect(readBudgetDraft({ ...draft, amount: '' }, money)).toEqual({
      ok: false,
      errors: { amount: 'budgets.error.amountRequired' },
    });
  });
});

describe('readRuleDraft', () => {
  const draft: RuleDraft = {
    name: ' Rent ',
    type: 'EXPENSE',
    accountId: 'acc',
    categoryId: 'rent',
    amount: '۲۵۰۰۰۰',
    frequency: 'MONTHLY',
    interval: '۱',
    start: '۱۴۰۵/۰۷/۲۱',
    end: '',
    autoPost: false,
  };
  const context = { ...money, displayCalendar: 'jalali' } as const;

  it('reads the fields, days in the display calendar and no end as null', () => {
    expect(readRuleDraft(draft, context)).toEqual({
      ok: true,
      fields: {
        name: 'Rent',
        type: 'EXPENSE',
        accountId: 'acc',
        categoryId: 'rent',
        amount: 250_000n,
        frequency: 'MONTHLY',
        interval: 1,
        startOn: '2026-10-13',
        endOn: null,
        autoPost: false,
      },
    });
  });

  it('says what is wrong with each field', () => {
    const result = readRuleDraft(
      {
        ...draft,
        name: '',
        categoryId: undefined,
        amount: '',
        interval: '53',
        end: '۱۴۰۵/۰۱/۰۱',
      },
      context,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        name: 'recurring.error.name',
        category: 'transactions.error.category',
        amount: 'transactions.error.amountRequired',
        interval: 'recurring.error.interval',
        end: 'recurring.error.endBeforeStart',
      },
    });
    expect(readRuleDraft({ ...draft, start: 'x' }, context)).toMatchObject({
      ok: false,
      errors: { start: 'transactions.error.day' },
    });
  });
});

describe('readPlannedItemDraft', () => {
  const draft: PlannedItemDraft = {
    name: ' اجاره ',
    kind: 'FIXED_MONTHLY',
    type: 'EXPENSE',
    categoryId: 'c1',
    amount: '۵۰۰۰',
    start: '۱۴۰۵/۰۱/۰۱',
    end: '',
  };
  const context = { ...money, displayCalendar: 'jalali', categoryIds: ['c1'] } as const;

  it('reads a Fixed Monthly item that runs on', () => {
    expect(readPlannedItemDraft(draft, context)).toEqual({
      ok: true,
      fields: {
        name: 'اجاره',
        categoryId: 'c1',
        amount: 5000n,
        startOn: '2026-03-21',
        endOn: null,
      },
    });
  });

  it('needs a Category for a Fixed Monthly item, but not for a One-Off, which never ends', () => {
    expect(readPlannedItemDraft({ ...draft, categoryId: null }, context)).toMatchObject({
      ok: false,
      errors: { category: 'plannedItems.error.category' },
    });
    expect(
      readPlannedItemDraft(
        { ...draft, kind: 'ONE_OFF', categoryId: null, end: '۱۴۰۵/۰۲/۰۱' },
        context,
      ),
    ).toMatchObject({ ok: true, fields: { categoryId: null, endOn: null } });
  });

  it('refuses a Category it may not use, an end before the start and a missing name', () => {
    expect(
      readPlannedItemDraft({ ...draft, name: ' ', categoryId: 'gone', end: '۱۴۰۴/۱۲/۰۱' }, context),
    ).toEqual({
      ok: false,
      errors: {
        name: 'plannedItems.error.name',
        category: 'plannedItems.error.category',
        end: 'plannedItems.error.endBeforeStart',
      },
    });
  });

  it('needs a positive Amount and real days', () => {
    expect(readPlannedItemDraft({ ...draft, amount: '0', start: 'x' }, context)).toEqual({
      ok: false,
      errors: { amount: 'transactions.error.amountPositive', start: 'transactions.error.day' },
    });
  });
});

describe('readValuationDraft', () => {
  const context = { ...money, displayCalendar: 'jalali' } as const;

  it('reads a value of zero or more on a day', () => {
    expect(readValuationDraft({ amount: '۱۲۰۰', day: '۱۴۰۵/۰۱/۰۱' }, context)).toEqual({
      ok: true,
      fields: { amount: 1200n, valuedOn: '2026-03-21' },
    });
    expect(readValuationDraft({ amount: '0', day: '۱۴۰۵/۰۱/۰۱' }, context)).toMatchObject({
      ok: true,
    });
  });

  it('refuses nothing typed, a negative value and a day that is not one', () => {
    expect(readValuationDraft({ amount: '', day: 'x' }, context)).toEqual({
      ok: false,
      errors: { amount: 'valuations.error.amountRequired', day: 'transactions.error.day' },
    });
    expect(readValuationDraft({ amount: '-1', day: '۱۴۰۵/۰۱/۰۱' }, context)).toEqual({
      ok: false,
      errors: { amount: 'valuations.error.negative' },
    });
  });
});
