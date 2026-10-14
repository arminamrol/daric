import { findCurrency } from '@daric/core';
import type { AccountClass, AccountType, CreateAccountInput, MoneyDisplay } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { readAmount } from '../forms/amount';

/** What the Account form's fields hold. */
export interface AccountDraft {
  name: string;
  type: AccountType;
  class: AccountClass;
  /** Fixed once the Account is made. */
  currency: string;
  /** Typed as shown; empty means zero. */
  openingBalance: string;
}

export interface AccountErrors {
  name?: PlainMessageKey;
  openingBalance?: PlainMessageKey;
}

/** The Account a draft describes, or what is wrong with its fields. */
export function readAccountDraft(
  draft: AccountDraft,
  moneyDisplay: MoneyDisplay,
): { ok: true; fields: Omit<CreateAccountInput, 'id'> } | { ok: false; errors: AccountErrors } {
  const name = draft.name.trim();
  const currency = findCurrency(draft.currency);
  if (!currency) throw new Error(`Unknown currency ${draft.currency}`);
  const balance = readAmount(draft.openingBalance, { currency, moneyDisplay });
  const errors: AccountErrors = {};
  if (name === '') errors.name = 'accounts.error.nameRequired';
  if (!balance.ok) errors.openingBalance = balance.error;
  if (errors.name || !balance.ok) return { ok: false, errors };
  return {
    ok: true,
    fields: {
      name,
      type: draft.type,
      class: draft.class,
      currency: currency.code,
      openingBalance: balance.amount,
    },
  };
}
