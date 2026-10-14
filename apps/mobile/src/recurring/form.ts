import { MAX_RECURRENCE_INTERVAL, parseDisplayDay, toLatinDigits } from '@daric/core';
import type {
  CalendarSystem,
  Currency,
  MoneyDisplay,
  ParsedCreateRecurringRuleInput,
  RecurrenceFrequency,
} from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { readAmount } from '../forms/amount';

/** What the Recurring Rule form's fields hold; days are typed in the display calendar. */
export interface RuleDraft {
  name: string;
  type: 'EXPENSE' | 'INCOME';
  accountId: string | undefined;
  categoryId: string | undefined;
  amount: string;
  frequency: RecurrenceFrequency;
  interval: string;
  start: string;
  /** Empty for a rule that repeats forever. */
  end: string;
  autoPost: boolean;
}

export type RuleField = 'name' | 'category' | 'amount' | 'interval' | 'start' | 'end';
export type RuleErrors = Partial<Record<RuleField, PlainMessageKey>>;

/** The rule a draft describes, or what is wrong with its fields. */
export function readRuleDraft(
  draft: RuleDraft,
  context: { currency: Currency; moneyDisplay: MoneyDisplay; displayCalendar: CalendarSystem },
):
  | { ok: true; fields: Omit<ParsedCreateRecurringRuleInput, 'id'> }
  | { ok: false; errors: RuleErrors } {
  const amount = readAmount(draft.amount, context, {
    required: 'transactions.error.amountRequired',
    positive: 'transactions.error.amountPositive',
  });
  const interval = Number(toLatinDigits(draft.interval).trim());
  const startOn = parseDisplayDay(draft.start, context.displayCalendar);
  const endOn =
    draft.end.trim() === '' ? null : parseDisplayDay(draft.end, context.displayCalendar);
  const errors: RuleErrors = {};
  if (draft.name.trim() === '') errors.name = 'recurring.error.name';
  if (!draft.categoryId) errors.category = 'transactions.error.category';
  if (!amount.ok) errors.amount = amount.error;
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_RECURRENCE_INTERVAL) {
    errors.interval = 'recurring.error.interval';
  }
  if (!startOn) errors.start = 'transactions.error.day';
  if (endOn === undefined) errors.end = 'transactions.error.day';
  else if (endOn && startOn && endOn < startOn) errors.end = 'recurring.error.endBeforeStart';
  if (
    Object.keys(errors).length > 0 ||
    !amount.ok ||
    !startOn ||
    endOn === undefined ||
    !draft.accountId ||
    !draft.categoryId
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    fields: {
      name: draft.name.trim(),
      type: draft.type,
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      amount: amount.amount,
      frequency: draft.frequency,
      interval,
      startOn,
      endOn,
      autoPost: draft.autoPost,
    },
  };
}
