import { money, sum } from '../money';
import type { Currency, Money } from '../money';

/** What kind of place an Account is; it only suggests a class and an icon. */
export const accountTypes = ['CASH', 'BANK', 'CARD', 'WALLET', 'LOAN', 'OTHER_ASSET'] as const;
export type AccountType = (typeof accountTypes)[number];

/**
 * Whether an Account counts towards Net Worth as something owned or owed.
 * A Liability's balance is what is owed: positive means money is owed.
 */
export const accountClasses = ['ASSET', 'LIABILITY'] as const;
export type AccountClass = (typeof accountClasses)[number];

/** The class a new Account of `type` most likely has; the user may pick the other. */
export function defaultAccountClass(type: AccountType): AccountClass {
  return type === 'LOAN' ? 'LIABILITY' : 'ASSET';
}

/**
 * An Account's balance: its opening balance plus the effect of each of its
 * Transactions, every one in the Account's currency.
 */
export function accountBalance(
  account: { readonly currency: Currency; readonly openingBalance: bigint },
  effects: readonly Money[] = [],
): Money {
  return sum(account.currency, [money(account.openingBalance, account.currency), ...effects]);
}
