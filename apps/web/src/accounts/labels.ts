import type { AccountClass, AccountType } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, PlainMessageKey> = {
  CASH: 'accounts.type.CASH',
  BANK: 'accounts.type.BANK',
  CARD: 'accounts.type.CARD',
  WALLET: 'accounts.type.WALLET',
  LOAN: 'accounts.type.LOAN',
  OTHER_ASSET: 'accounts.type.OTHER_ASSET',
};

export const ACCOUNT_CLASS_LABELS: Record<AccountClass, PlainMessageKey> = {
  ASSET: 'accounts.class.ASSET',
  LIABILITY: 'accounts.class.LIABILITY',
};

export const ACCOUNT_GROUP_LABELS: Record<AccountClass, PlainMessageKey> = {
  ASSET: 'accounts.group.ASSET',
  LIABILITY: 'accounts.group.LIABILITY',
};
