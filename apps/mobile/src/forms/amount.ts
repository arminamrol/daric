import { parseAmount } from '@daric/core';
import type { Currency, MoneyDisplay, ParseAmountError } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';

export const AMOUNT_ERRORS: Record<Exclude<ParseAmountError, 'empty'>, PlainMessageKey> = {
  invalid: 'accounts.error.amountInvalid',
  too_many_decimals: 'accounts.error.amountTooPrecise',
  out_of_range: 'accounts.error.amountTooLarge',
};

/**
 * An Amount typed as shown (in tomans when the Workspace shows IRR in tomans)
 * in the minor unit of `currency`. Nothing typed is zero unless `required`
 * says what to tell; with `positive`, zero or less is refused.
 */
export function readAmount(
  text: string,
  { currency, moneyDisplay }: { currency: Currency; moneyDisplay: MoneyDisplay },
  messages: { required?: PlainMessageKey; positive?: PlainMessageKey } = {},
): { ok: true; amount: bigint } | { ok: false; error: PlainMessageKey } {
  const parsed = parseAmount(text, currency, { display: moneyDisplay });
  if (!parsed.ok) {
    if (parsed.error !== 'empty') return { ok: false, error: AMOUNT_ERRORS[parsed.error] };
    if (messages.required) return { ok: false, error: messages.required };
    return messages.positive ? { ok: false, error: messages.positive } : { ok: true, amount: 0n };
  }
  const { amount } = parsed.money;
  if (messages.positive && amount <= 0n) return { ok: false, error: messages.positive };
  return { ok: true, amount };
}
