import type { SyncState } from '@daric/api-client';
import { money } from '@daric/core';
import type { Budget, BudgetState, Category } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import type { PlainMessageKey } from '@daric/i18n';
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { currencyOf } from '../accounts/accounts';
import { CategoryBadge } from '../categories/CategoryBadge';
import { useFormatters } from '../display/formatters';
import { useI18n } from '../i18n/locale';
import { ProgressBar } from '../ui/ProgressBar';
import { SyncMark } from '../ui/SyncMark';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

/** Each state has its own words and icon, so color is never the only sign. */
const STATES: Record<
  BudgetState,
  {
    label: PlainMessageKey;
    icon: LucideIcon;
    tone: 'success' | 'foreground' | 'danger';
    bar: 'success' | 'primary' | 'danger';
  }
> = {
  ok: { label: 'budgets.state.ok', icon: CircleCheck, tone: 'success', bar: 'success' },
  // There is no warning token; warning uses the primary color for the bar.
  warning: {
    label: 'budgets.state.warning',
    icon: TriangleAlert,
    tone: 'foreground',
    bar: 'primary',
  },
  over: { label: 'budgets.state.over', icon: CircleAlert, tone: 'danger', bar: 'danger' },
};

/** One Budget with a progress bar for the Period it is shown in. Owners and Admins open it to edit. */
export function BudgetCard({
  budget,
  name,
  category,
  state,
  onPress,
}: {
  budget: Budget;
  name: string;
  category: Category | undefined;
  state: SyncState | undefined;
  onPress: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const format = useFormatters();
  const { progress } = budget;
  const currency = currencyOf(budget);
  const amount = (value: bigint) => format.money(money(value, currency));
  const shown = STATES[progress.state];
  const StateIcon = shown.icon;
  const periodOf = t('budgets.periodOf', {
    period: t(`budgets.period.${budget.period}`),
    name: format.period(progress.period),
  });
  const valueText = t('budgets.progress', {
    spent: isolate(amount(progress.spent)),
    limit: isolate(amount(budget.amount)),
    state: t(shown.label),
  });

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole={onPress ? 'button' : 'header'}
        accessibilityLabel={[
          onPress ? t('budgets.edit', { name: isolate(name) }) : name,
          periodOf,
        ].join(t('list.separator'))}
        disabled={!onPress}
        onPress={onPress}
        style={styles.head}
      >
        {category && <CategoryBadge icon={category.icon} color={category.color} size="sm" />}
        <View style={styles.title}>
          <Text bold>{name}</Text>
          <Text size="sm" tone="foregroundMuted">
            {periodOf}
          </Text>
        </View>
      </Pressable>
      <ProgressBar
        percent={progress.percent}
        color={colors[shown.bar]}
        label={name}
        valueText={valueText}
      />
      <View style={styles.line} importantForAccessibility="no-hide-descendants">
        <Text size="sm" style={styles.grow}>
          {t('budgets.spentOf', {
            spent: isolate(amount(progress.spent)),
            limit: isolate(amount(budget.amount)),
          })}
        </Text>
        <StateIcon color={colors[shown.tone]} size={16} strokeWidth={2} />
        <Text size="sm" bold tone={shown.tone}>
          {t(shown.label)}
        </Text>
      </View>
      <Text size="sm" tone="foregroundMuted">
        {progress.remaining < 0n
          ? t('budgets.overBy', { amount: isolate(amount(-progress.remaining)) })
          : t('budgets.remaining', { amount: isolate(amount(progress.remaining)) })}
      </Text>
      {progress.otherCurrencyExpenses > 0 && (
        <Text size="sm" tone="foregroundMuted">
          {t('budgets.otherCurrency')}
        </Text>
      )}
      <SyncMark state={state} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: nativeTheme.space(3),
    padding: nativeTheme.space(4),
    borderRadius: nativeTheme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: nativeTheme.space(3), minHeight: 44 },
  title: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: nativeTheme.space(1) },
  grow: { flex: 1 },
});
