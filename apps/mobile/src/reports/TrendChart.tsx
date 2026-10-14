import { currencyByCode, money, periodParam } from '@daric/core';
import type { Report } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Rect } from 'react-native-svg';
import { Chart } from '../charts/Chart';
import { barPlot, extremes, nearest } from '../charts/geometry';
import type { PlotBox } from '../charts/geometry';
import { useFormatters, useShownInBase } from '../display/formatters';
import { useI18n } from '../i18n/locale';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

const SERIES = [
  { key: 'income', color: 'chartIncome' },
  { key: 'expense', color: 'chartExpense' },
] as const;

/**
 * Each month's Income and Expense side by side, read out as a summary of its
 * highest months; a touch shows one month's figures, the last to start with.
 */
export function TrendChart({
  trend,
  baseCurrency,
}: {
  trend: Report['trend'];
  baseCurrency: string;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const format = useFormatters();
  // By month, so another Period never highlights a month it does not hold.
  const [picked, setPicked] = useState<string>();
  const base = currencyByCode(baseCurrency);
  const shown = useShownInBase(baseCurrency);
  const income = extremes(trend, (p) => p.income);
  const expense = extremes(trend, (p) => p.expense);
  if (!income || !expense) return null;

  const plot = (box: PlotBox) =>
    barPlot(
      trend.map((p) => [Number(p.income), Number(p.expense)]),
      box,
    );
  const found = trend.findIndex((p) => periodParam(p.month) === picked);
  const index = found === -1 ? trend.length - 1 : found;
  const current = trend[index] ?? income.last;
  const span = {
    from: isolate(format.period(income.first.month)),
    to: isolate(format.period(income.last.month)),
    base: format.currency(base),
  };
  // With nothing recorded there is no highest month to name.
  const nothing = income.highest.income === 0n && expense.highest.expense === 0n;
  const summary = nothing
    ? t('reports.trendChart', span)
    : t('reports.trendSummary', {
        ...span,
        income: isolate(shown(income.highest.income)),
        incomeMonth: isolate(format.period(income.highest.month)),
        expense: isolate(shown(expense.highest.expense)),
        expenseMonth: isolate(format.period(expense.highest.month)),
      });

  return (
    <>
      <View
        style={styles.legend}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Text size="sm" tone="foregroundMuted" style={styles.grow}>
          {format.period(current.month)}
        </Text>
        {SERIES.map(({ key, color }) => (
          <View key={key} style={styles.key}>
            <View style={[styles.swatch, { backgroundColor: colors[color] }]} />
            <Text size="sm">
              {t('reports.figure', { name: t(`reports.${key}`), amount: shown(current[key]) })}
            </Text>
          </View>
        ))}
        <Text size="sm">
          {t('reports.figure', { name: t('reports.net'), amount: shown(current.net) })}
        </Text>
      </View>
      <Chart
        height={220}
        summary={summary}
        tickLabel={(value) =>
          format.money(money(BigInt(Math.round(value)), base), { label: false })
        }
        span={{ from: format.period(income.first.month), to: format.period(income.last.month) }}
        onTouch={(x, box) => {
          const point =
            trend[
              nearest(
                plot(box).bands.map((b) => (b.start + b.end) / 2),
                x,
              )
            ];
          setPicked(point && periodParam(point.month));
        }}
        draw={(box) => {
          const { bars, bands, ticks } = plot(box);
          const band = bands[index];
          return {
            ticks,
            marks: (
              <>
                {band && (
                  <Rect
                    x={band.start}
                    y={0}
                    width={band.end - band.start}
                    height={box.height}
                    fill={colors.surfaceMuted}
                    opacity={0.7}
                  />
                )}
                {bars.map((bar) => (
                  <Rect
                    key={`${bar.group}-${bar.series}`}
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    rx={2}
                    fill={colors[SERIES[bar.series]?.color ?? 'chartIncome']}
                  />
                ))}
              </>
            ),
          };
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: nativeTheme.space(3),
  },
  grow: { flexGrow: 1 },
  key: { flexDirection: 'row', alignItems: 'center', gap: nativeTheme.space(1) },
  swatch: { width: 10, height: 10, borderRadius: nativeTheme.radius.full },
});
