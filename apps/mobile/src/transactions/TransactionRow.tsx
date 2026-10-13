import type { SyncState } from '@daric/api-client';
import { findCurrency, IRR, money } from '@daric/core';
import type { Account, DisplayFormatters, Transaction } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import type { PlainMessageKey } from '@daric/i18n';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n/locale';
import { Text } from '../ui/Text';

const SYNC_LABELS = {
  pending: 'transactions.list.pending',
  conflict: 'transactions.list.conflict',
  rejected: 'transactions.list.rejected',
} as const satisfies Record<SyncState, PlainMessageKey>;

/** One Transaction in the list, read out as one item: what, where, when, how much and whether it was sent. */
export function TransactionRow({
  transaction,
  accounts,
  categoryLabels,
  state,
  format,
}: {
  transaction: Transaction;
  accounts: ReadonlyMap<string, Account>;
  categoryLabels: ReadonlyMap<string, string>;
  state: SyncState | undefined;
  format: DisplayFormatters;
}) {
  const { t } = useI18n();
  const amountIn = (amount: bigint, accountId: string) => {
    const currency = findCurrency(accounts.get(accountId)?.currency ?? '') ?? IRR;
    return format.money(money(amount, currency));
  };
  const account = accounts.get(transaction.accountId);
  let title: string;
  let where: string;
  let shown: string;
  let tone: 'foreground' | 'foregroundMuted' | 'success' = 'foreground';
  if (transaction.type === 'TRANSFER') {
    title = t('transactions.type.TRANSFER');
    where = t('transactions.list.transferAccounts', {
      from: isolate(account?.name ?? ''),
      to: isolate(accounts.get(transaction.toAccountId)?.name ?? ''),
    });
    shown = amountIn(transaction.amount, transaction.accountId);
    tone = 'foregroundMuted';
  } else {
    const income = transaction.type === 'INCOME';
    title = categoryLabels.get(transaction.categoryId) ?? '';
    where = isolate(account?.name ?? '');
    shown = `${income ? '+' : '−'}${amountIn(transaction.amount, transaction.accountId)}`;
    if (income) tone = 'success';
  }
  const day = format.day(transaction.occurredOn);
  const mark = state && t(SYNC_LABELS[state]);
  return (
    <View
      accessible
      accessibilityLabel={[title, shown, where, day, transaction.note, mark]
        .filter(Boolean)
        .join('، ')}
      style={styles.row}
    >
      <View style={styles.main}>
        <Text bold>{title}</Text>
        <Text size="sm" tone="foregroundMuted">
          {where} · {day}
        </Text>
        {transaction.note && (
          <Text size="sm" tone="foregroundMuted" numberOfLines={1}>
            {transaction.note}
          </Text>
        )}
        {mark && (
          <Text size="xs" tone={state === 'pending' ? 'foregroundMuted' : 'danger'}>
            {mark}
          </Text>
        )}
      </View>
      <Text bold tone={tone} style={styles.amount}>
        {shown}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeTheme.space(3),
    paddingHorizontal: nativeTheme.space(4),
    paddingVertical: nativeTheme.space(3),
  },
  main: { flex: 1, gap: nativeTheme.space(0.5) },
  amount: { fontVariant: ['tabular-nums'] },
});
