import { parseDisplayDay } from '@daric/core';
import type { CalendarSystem, CreateTransactionInput, Currency, MoneyDisplay } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { readAmount } from '../forms/amount';

/** What the fast-entry fields hold. */
export interface Draft {
  /** One id per draft: sending the same draft again (a retry) cannot record it twice. */
  id: string;
  /** Transfers are recorded elsewhere (ticket 31). */
  type: 'EXPENSE' | 'INCOME';
  amount: string;
  accountId: string | undefined;
  categoryId: string | undefined;
  /** Typed in the User's display calendar, `year/month/day`. */
  day: string;
  note: string;
}

export interface DraftErrors {
  amount?: PlainMessageKey;
  account?: PlainMessageKey;
  category?: PlainMessageKey;
  day?: PlainMessageKey;
}

/** The Transaction a draft describes, or what is wrong with its fields. */
export function readDraft(
  draft: Draft,
  context: {
    /** Of the chosen Account. */
    currency: Currency;
    moneyDisplay: MoneyDisplay;
    displayCalendar: CalendarSystem;
  },
):
  | { ok: true; input: Extract<CreateTransactionInput, { type: 'EXPENSE' | 'INCOME' }> }
  | { ok: false; errors: DraftErrors } {
  const amount = readAmount(draft.amount, context, {
    required: 'transactions.error.amountRequired',
    positive: 'transactions.error.amountPositive',
  });
  const occurredOn = parseDisplayDay(draft.day, context.displayCalendar);
  const errors: DraftErrors = {};
  if (!amount.ok) errors.amount = amount.error;
  if (!draft.accountId) errors.account = 'transactions.noAccount';
  if (!draft.categoryId) errors.category = 'transactions.error.category';
  if (!occurredOn) errors.day = 'transactions.error.day';
  if (!amount.ok || !draft.accountId || !draft.categoryId || !occurredOn) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      id: draft.id,
      type: draft.type,
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      amount: amount.amount,
      occurredOn,
      note: draft.note.trim() || null,
      labelIds: [],
    },
  };
}
