import { controllableSavings, DEFAULT_SAVINGS_PERCENT, periodParam } from '@daric/core';
import type { Label, Report } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCurrencyList, useFormatters, useShownInBase } from '../display/formatters';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Card, Figure, Heading, Rows } from '../ui/Card';
import { ListRow } from '../ui/ListRow';
import { Stepper } from '../ui/Stepper';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';
import { useShare } from './reports';
import { ShareBar } from './ShareBar';

/** The savings move in steps of this many percent. */
const SAVINGS_STEP = 5;

function Savings({
  controllable,
  baseCurrency,
}: {
  controllable: Report['controllable'];
  baseCurrency: string;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const format = useFormatters();
  const [percent, setPercent] = useState(DEFAULT_SAVINGS_PERCENT);
  const shown = useShownInBase(baseCurrency);
  const percentText = useShare()(percent);
  const average = shown(controllable.monthlyAverage);
  const savings = controllableSavings(controllable.monthlyAverage, percent);

  if (controllable.monthsAveraged === 0) {
    return (
      <Text size="sm" tone="foregroundMuted">
        {t('reports.savingsNoBasis')}
      </Text>
    );
  }
  return (
    <View style={[styles.savings, { backgroundColor: colors.surfaceMuted }]}>
      <Heading small>{t('reports.savings')}</Heading>
      <Stepper
        label={t('reports.savingsSlider')}
        value={percent}
        valueText={percentText}
        min={0}
        max={100}
        step={SAVINGS_STEP}
        onChange={setPercent}
      />
      <Text size="sm" tone="foregroundMuted">
        {controllable.averageRunning
          ? t('reports.savingsBasisRunning', { average })
          : t('reports.savingsBasis', {
              months: format.count(controllable.monthsAveraged),
              average,
            })}
      </Text>
      <View accessibilityLiveRegion="polite" style={styles.pair}>
        <View style={styles.grow}>
          <Figure label={t('reports.savingsMonthly')} value={shown(savings.monthly)} />
        </View>
        <View style={styles.grow}>
          <Figure label={t('reports.savingsYearly')} value={shown(savings.yearly)} />
        </View>
      </View>
    </View>
  );
}

/**
 * The Period's spending under Controllable Labels, its Labels and months, and
 * what reducing it would save; every figure comes from the API or from core's
 * `controllableSavings`.
 */
export function ControllableSpending({
  report,
  labels,
}: {
  report: Report;
  labels: readonly Label[];
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const format = useFormatters();
  const router = useRouter();
  const currencyList = useCurrencyList();
  const { controllable } = report;
  const shown = useShownInBase(report.baseCurrency);
  const share = useShare();
  const nameOf = (id: string) => labels.find((l) => l.id === id)?.name ?? '';
  const largest = controllable.trend.reduce((max, p) => (p.expense > max ? p.expense : max), 0n);

  return (
    <View style={styles.part}>
      <Heading>{t('reports.controllable')}</Heading>
      {!labels.some((label) => label.controllable) ? (
        <>
          <Text tone="foregroundMuted">{t('reports.controllableNone')}</Text>
          <Button
            label={t('reports.controllableLabelsLink')}
            onPress={() => router.push('/labels')}
          />
        </>
      ) : (
        <>
          <Text size="sm" tone="foregroundMuted">
            {t('reports.controllableIntro')}
          </Text>
          <Card>
            <View style={styles.pair}>
              <View style={styles.grow}>
                <Figure
                  large
                  label={t('reports.controllableTotal')}
                  value={shown(controllable.expense)}
                />
              </View>
              <View style={styles.grow}>
                <Figure
                  large
                  label={t('reports.controllableShare')}
                  value={share(controllable.share)}
                />
              </View>
            </View>
            <Savings controllable={controllable} baseCurrency={report.baseCurrency} />
            {controllable.labels.length > 0 && (
              <>
                <Heading small>{t('reports.controllableByLabel')}</Heading>
                {controllable.labels.map((line) => (
                  <Figure
                    key={line.labelId}
                    row
                    label={nameOf(line.labelId)}
                    value={`${shown(line.expense)} · ${share(line.share)}`}
                  />
                ))}
              </>
            )}
          </Card>
          <Heading small>{t('reports.controllableTrend')}</Heading>
          <Rows>
            {/* Newest first, like the trend list above. */}
            {[...controllable.trend].reverse().map((point) => (
              <ListRow
                key={periodParam(point.month)}
                title={format.period(point.month)}
                trailing={shown(point.expense)}
                lines={[
                  point.missing.length > 0 &&
                    t('reports.trendMissing', {
                      currencies: currencyList(point.missing),
                    }),
                ]}
              >
                <View style={styles.bar}>
                  <ShareBar
                    percent={largest === 0n ? 0 : Number((point.expense * 100n) / largest)}
                    color={colors.chartExpense}
                  />
                </View>
              </ListRow>
            ))}
          </Rows>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  part: { gap: nativeTheme.space(2) },
  savings: {
    gap: nativeTheme.space(3),
    padding: nativeTheme.space(3),
    borderRadius: nativeTheme.radius.md,
  },
  pair: { flexDirection: 'row', gap: nativeTheme.space(4) },
  grow: { flex: 1 },
  bar: { width: 64 },
});
