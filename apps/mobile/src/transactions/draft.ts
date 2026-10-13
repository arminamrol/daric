import { parseAmount, parseDisplayDay } from '@daric/core';
import type {
  CalendarSystem,
  CreateTransactionInput,
  Currency,
  MoneyDisplay,
  ParseAmountError,
} from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';

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

const AMOUNT_ERRORS: Record<ParseAmountError, PlainMessageKey> = {
  empty: 'transactions.error.amountRequired',
  invalid: 'accounts.error.amountInvalid',
  too_many_decimals: 'accounts.error.amountTooPrecise',
  out_of_range: 'accounts.error.amountTooLarge',
};

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
  const parsed = parseAmount(draft.amount, context.currency, { display: context.moneyDisplay });
  const occurredOn = parseDisplayDay(draft.day, context.displayCalendar);
  const errors: DraftErrors = {};
  if (!parsed.ok) errors.amount = AMOUNT_ERRORS[parsed.error];
  else if (parsed.money.amount <= 0n) errors.amount = 'transactions.error.amountPositive';
  if (!draft.accountId) errors.account = 'transactions.noAccount';
  if (!draft.categoryId) errors.category = 'transactions.error.category';
  if (!occurredOn) errors.day = 'transactions.error.day';
  if (errors.amount || !parsed.ok || !draft.accountId || !draft.categoryId || !occurredOn) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      id: draft.id,
      type: draft.type,
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      amount: parsed.money.amount,
      occurredOn,
      note: draft.note.trim() || null,
      labelIds: [],
    },
  };
}
