import type { BudgetPeriod, Currency, MoneyDisplay } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { readAmount } from '../forms/amount';

export interface BudgetDraft {
  categoryId: string | undefined;
  /** Null for every Expense of the Category. */
  labelId: string | null;
  period: BudgetPeriod;
  /** The limit per Period, typed as shown in the Base Currency. */
  amount: string;
}

export interface BudgetErrors {
  category?: PlainMessageKey;
  amount?: PlainMessageKey;
}

/** The Budget a draft describes, or what is wrong with its fields. */
export function readBudgetDraft(
  draft: BudgetDraft,
  money: { currency: Currency; moneyDisplay: MoneyDisplay },
):
  | {
      ok: true;
      fields: { categoryId: string; labelId: string | null; period: BudgetPeriod; amount: bigint };
    }
  | { ok: false; errors: BudgetErrors } {
  const amount = readAmount(draft.amount, money, {
    required: 'budgets.error.amountRequired',
    positive: 'budgets.error.amountPositive',
  });
  const errors: BudgetErrors = {};
  if (!draft.categoryId) errors.category = 'budgets.error.category';
  if (!amount.ok) errors.amount = amount.error;
  if (!draft.categoryId || !amount.ok) return { ok: false, errors };
  return {
    ok: true,
    fields: {
      categoryId: draft.categoryId,
      labelId: draft.labelId,
      period: draft.period,
      amount: amount.amount,
    },
  };
}
