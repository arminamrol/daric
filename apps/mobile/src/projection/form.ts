import { parseDisplayDay } from '@daric/core';
import type { CalendarSystem, Currency, IsoDay, MoneyDisplay, PlannedItemKind } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { readAmount } from '../forms/amount';

/** What the Planned Item form's fields hold; days are typed in the display calendar. */
export interface PlannedItemDraft {
  name: string;
  kind: PlannedItemKind;
  type: 'EXPENSE' | 'INCOME';
  /** Null for none, which only a One-Off may have. */
  categoryId: string | null;
  /** Per month for a Fixed Monthly item, typed as shown in the item's currency. */
  amount: string;
  start: string;
  /** A Fixed Monthly's last day; empty runs on. A One-Off's is ignored. */
  end: string;
}

export type PlannedItemField = 'name' | 'category' | 'amount' | 'start' | 'end';
export type PlannedItemErrors = Partial<Record<PlannedItemField, PlainMessageKey>>;

/**
 * The item a draft describes, or what is wrong with its fields. Its
 * Category must be one of `categoryIds`, those it may be given.
 */
export function readPlannedItemDraft(
  draft: PlannedItemDraft,
  context: {
    currency: Currency;
    moneyDisplay: MoneyDisplay;
    displayCalendar: CalendarSystem;
    categoryIds: readonly string[];
  },
):
  | {
      ok: true;
      fields: {
        name: string;
        categoryId: string | null;
        amount: bigint;
        startOn: IsoDay;
        endOn: IsoDay | null;
      };
    }
  | { ok: false; errors: PlannedItemErrors } {
  const monthly = draft.kind === 'FIXED_MONTHLY';
  const amount = readAmount(draft.amount, context, {
    required: 'transactions.error.amountRequired',
    positive: 'transactions.error.amountPositive',
  });
  const startOn = parseDisplayDay(draft.start, context.displayCalendar);
  const endOn =
    !monthly || draft.end.trim() === ''
      ? null
      : parseDisplayDay(draft.end, context.displayCalendar);
  const errors: PlannedItemErrors = {};
  if (draft.name.trim() === '') errors.name = 'plannedItems.error.name';
  if (draft.categoryId === null ? monthly : !context.categoryIds.includes(draft.categoryId)) {
    errors.category = 'plannedItems.error.category';
  }
  if (!amount.ok) errors.amount = amount.error;
  if (!startOn) errors.start = 'transactions.error.day';
  if (endOn === undefined) errors.end = 'transactions.error.day';
  else if (endOn && startOn && endOn < startOn) errors.end = 'plannedItems.error.endBeforeStart';
  if (Object.keys(errors).length > 0 || !amount.ok || !startOn || endOn === undefined) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    fields: {
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      amount: amount.amount,
      startOn,
      endOn,
    },
  };
}
