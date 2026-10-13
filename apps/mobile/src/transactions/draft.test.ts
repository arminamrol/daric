import { IRR, USD } from '@daric/core';
import { describe, expect, it } from 'vitest';
import { readDraft } from './draft';
import type { Draft } from './draft';

const draft: Draft = {
  id: '01900000-0000-7000-8000-0000000000d1',
  type: 'EXPENSE',
  amount: '۲۵۰٬۰۰۰',
  accountId: 'acc-1',
  categoryId: 'cat-1',
  day: '۱۴۰۵/۰۷/۲۱',
  note: '  نان  ',
};
const context = { currency: IRR, moneyDisplay: 'rial', displayCalendar: 'jalali' } as const;

describe('readDraft', () => {
  it('reads the fields as a Transaction to record, the day in the display calendar', () => {
    expect(readDraft(draft, context)).toEqual({
      ok: true,
      input: {
        id: draft.id,
        type: 'EXPENSE',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        amount: 250_000n,
        occurredOn: '2026-10-13',
        note: 'نان',
        labelIds: [],
      },
    });
  });

  it('reads an amount in toman as rials when the Workspace shows toman', () => {
    const result = readDraft({ ...draft, amount: '25000' }, { ...context, moneyDisplay: 'toman' });
    expect(result.ok && result.input.amount).toBe(250_000n);
  });

  it('reads an amount in the minor unit of the Account currency', () => {
    const result = readDraft({ ...draft, amount: '12.5' }, { ...context, currency: USD });
    expect(result.ok && result.input.amount).toBe(1250n);
  });

  it('leaves an empty note out', () => {
    const result = readDraft({ ...draft, note: '   ' }, context);
    expect(result.ok && result.input.note).toBeNull();
  });

  it('says what is wrong with each field', () => {
    expect(readDraft({ ...draft, amount: '' }, context)).toEqual({
      ok: false,
      errors: { amount: 'transactions.error.amountRequired' },
    });
    expect(readDraft({ ...draft, amount: '0' }, context)).toEqual({
      ok: false,
      errors: { amount: 'transactions.error.amountPositive' },
    });
    expect(readDraft({ ...draft, amount: 'abc' }, context)).toEqual({
      ok: false,
      errors: { amount: 'accounts.error.amountInvalid' },
    });
    expect(readDraft({ ...draft, categoryId: undefined, day: '1405/13/40' }, context)).toEqual({
      ok: false,
      errors: { category: 'transactions.error.category', day: 'transactions.error.day' },
    });
  });

  it('cannot record without an Account', () => {
    expect(readDraft({ ...draft, accountId: undefined }, context)).toEqual({
      ok: false,
      errors: { account: 'transactions.noAccount' },
    });
  });
});
