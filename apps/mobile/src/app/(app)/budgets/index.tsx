import { hasRole, nextPeriod, previousPeriod } from '@daric/core';
import type { Budget } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSignedIn } from '../../../auth/session';
import { BudgetCard } from '../../../budgets/BudgetCard';
import { useBudgets } from '../../../budgets/budgets';
import { useBudgetNames } from '../../../budgets/names';
import { useCategories } from '../../../categories/categories';
import { useFormatters } from '../../../display/formatters';
import { useI18n } from '../../../i18n/locale';
import { useLabels } from '../../../labels/labels';
import { Button } from '../../../ui/Button';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { ListScreen } from '../../../ui/ListScreen';
import { Status } from '../../../ui/Screen';
import { Text } from '../../../ui/Text';

/** Every Budget with its progress in one month of the Workspace Calendar, this one to start with. */
export default function BudgetsScreen() {
  const { t } = useI18n();
  const format = useFormatters();
  const router = useRouter();
  const { workspace } = useSignedIn();
  const [month, setMonth] = useState(() => format.currentPeriod(new Date()));
  const budgets = useBudgets(month);
  const categories = useCategories();
  const labels = useLabels();
  const nameOf = useBudgetNames(categories.data, labels.data);
  const categoryMap = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );
  const canManage = hasRole(workspace.role, 'ADMIN');

  const header = (
    <ScreenHeader
      title={t('budgets.title')}
      action={canManage && { label: t('budgets.new'), onPress: () => router.push('/budgets/new') }}
    />
  );
  const monthNav = (
    <View style={styles.months}>
      <Button label={t('budgets.previousMonth')} onPress={() => setMonth(previousPeriod(month))} />
      <Text bold accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.month}>
        {format.period(month)}
      </Text>
      <Button label={t('budgets.nextMonth')} onPress={() => setMonth(nextPeriod(month))} />
    </View>
  );
  if (budgets.isPending)
    return (
      <>
        {header}
        <Status message={t('session.loading')} />
      </>
    );
  if (!budgets.data)
    return (
      <>
        {header}
        <Status alert message={t('budgets.loadFailed')} />
      </>
    );

  return (
    <>
      {header}
      <ListScreen<Budget>
        sections={[{ key: 'budgets', data: budgets.data }]}
        keyOf={(b) => b.id}
        header={monthNav}
        renderItem={(budget) => (
          <View style={styles.card}>
            <BudgetCard
              budget={budget}
              name={nameOf(budget)}
              category={categoryMap.get(budget.categoryId)}
              state={budgets.states?.get(budget.id)}
              onPress={canManage ? () => router.push(`/budgets/${budget.id}`) : undefined}
            />
          </View>
        )}
        empty={t('budgets.empty')}
        refreshing={budgets.isRefetching}
        onRefresh={() => void budgets.refetch()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  months: { flexDirection: 'row', alignItems: 'center', gap: nativeTheme.space(2) },
  month: { flex: 1, textAlign: 'center' },
  card: { paddingHorizontal: nativeTheme.space(4), paddingVertical: nativeTheme.space(2) },
});
