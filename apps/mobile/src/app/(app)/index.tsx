import { categoryTree, groupByMonth } from '@daric/core';
import type { Account, Transaction } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSignedIn } from '../../auth/session';
import { useFormatters } from '../../display/formatters';
import { useI18n } from '../../i18n/locale';
import { currencyOf, useAccounts } from '../../accounts/accounts';
import { useCategories } from '../../categories/categories';
import { useWaitingWrites } from '../../offline/offline';
import { TransactionRow } from '../../transactions/TransactionRow';
import { useTransactions } from '../../transactions/transactions';
import { Status } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';

/** This year's Transactions of the Workspace Calendar, by month, newest first, with a button to record one. */
export default function TransactionsScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const year = format.currentPeriod(new Date()).year;
  const filters = useMemo(() => ({ period: { kind: 'year', year } as const }), [year]);
  const list = useTransactions(filters);
  const accounts = useAccounts({ includeArchived: true });
  const categories = useCategories();
  const waiting = useWaitingWrites(workspace.id);
  const canRecord = workspace.role !== 'VIEWER';

  const accountMap = useMemo(
    () => new Map<string, Account>((accounts.data ?? []).map((a) => [a.id, a])),
    [accounts.data],
  );
  const categoryLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const top of categoryTree(categories.data ?? [])) {
      labels.set(top.id, top.name);
      for (const child of top.children) {
        labels.set(
          child.id,
          t('transactions.categoryPath', { parent: isolate(top.name), child: isolate(child.name) }),
        );
      }
    }
    return labels;
  }, [categories.data, t]);
  const sections = useMemo(
    () =>
      groupByMonth(list.transactions ?? [], workspace.calendar, (tr: Transaction) =>
        currencyOf(accountMap.get(tr.accountId)),
      ).map((group) => ({ title: format.period(group.period), data: group.transactions })),
    [list.transactions, workspace.calendar, accountMap, format],
  );

  if (list.isPending) return <Status message={t('session.loading')} />;
  if (!list.transactions) return <Status alert message={t('transactions.list.loadFailed')} />;

  return (
    <View style={styles.fill}>
      {waiting.length > 0 && (
        <Link href="/sync" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('sync.open')}
            accessibilityHint={t('sync.pending')}
            accessibilityLiveRegion="polite"
            style={StyleSheet.flatten([styles.notice, { backgroundColor: colors.surfaceMuted }])}
          >
            <Text size="sm">{t('sync.pending')}</Text>
          </Pressable>
        </Link>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.header, { backgroundColor: colors.background }]}>
            <Text size="lg" bold accessibilityRole="header">
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TransactionRow
            transaction={item}
            accounts={accountMap}
            categoryLabels={categoryLabels}
            state={list.states.get(item.id)}
            format={format}
          />
        )}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
        )}
        ListEmptyComponent={
          <Text tone="foregroundMuted" style={styles.empty}>
            {t('transactions.list.empty')}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + nativeTheme.space(24) }}
        stickySectionHeadersEnabled
      />
      {canRecord && (
        <Link href="/new" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('transactions.form.title')}
            // Link passes its own props down through a Slot, which takes one style object.
            style={StyleSheet.flatten([
              styles.fab,
              { backgroundColor: colors.primary, bottom: insets.bottom + nativeTheme.space(6) },
            ])}
          >
            <Text size="3xl" bold tone="onPrimary" importantForAccessibility="no">
              +
            </Text>
          </Pressable>
        </Link>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  notice: { paddingHorizontal: nativeTheme.space(4), paddingVertical: nativeTheme.space(2) },
  header: { paddingHorizontal: nativeTheme.space(4), paddingVertical: nativeTheme.space(2) },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: nativeTheme.space(4) },
  empty: { textAlign: 'center', padding: nativeTheme.space(8) },
  fab: {
    position: 'absolute',
    end: nativeTheme.space(6),
    width: 64,
    height: 64,
    borderRadius: nativeTheme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
