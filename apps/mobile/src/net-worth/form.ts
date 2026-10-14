import { parseDisplayDay } from '@daric/core';
import type { CalendarSystem, Currency, IsoDay, MoneyDisplay } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { readAmount } from '../forms/amount';

/** What an Account is worth, typed as shown in its currency, from a day typed in the display calendar. */
export interface ValuationDraft {
  amount: string;
  day: string;
}

export type ValuationErrors = Partial<Record<keyof ValuationDraft, PlainMessageKey>>;

/** The Valuation a draft describes, or what is wrong with its fields. */
export function readValuationDraft(
  draft: ValuationDraft,
  context: { currency: Currency; moneyDisplay: MoneyDisplay; displayCalendar: CalendarSystem },
):
  | { ok: true; fields: { amount: bigint; valuedOn: IsoDay } }
  | { ok: false; errors: ValuationErrors } {
  const amount = readAmount(draft.amount, context, {
    required: 'valuations.error.amountRequired',
  });
  const valuedOn = parseDisplayDay(draft.day, context.displayCalendar);
  const errors: ValuationErrors = {};
  if (!amount.ok) errors.amount = amount.error;
  else if (amount.amount < 0n) errors.amount = 'valuations.error.negative';
  if (!valuedOn) errors.day = 'transactions.error.day';
  if (!amount.ok || errors.amount || !valuedOn) return { ok: false, errors };
  return { ok: true, fields: { amount: amount.amount, valuedOn } };
}
