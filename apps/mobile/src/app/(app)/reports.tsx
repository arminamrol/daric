import { currencyByCode, nextPeriod, periodParam, previousPeriod } from '@daric/core';
import type { Category, Label, Period, Report, TransactionType } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSignedIn } from '../../auth/session';
import { useCategories } from '../../categories/categories';
import { useFormatters } from '../../display/formatters';
import { useI18n } from '../../i18n/locale';
import { useLabels } from '../../labels/labels';
import { ControllableSpending } from '../../reports/ControllableSpending';
import { useReport, useShare, useShownInBase } from '../../reports/reports';
import { ShareBar } from '../../reports/ShareBar';
import { TrendChart } from '../../reports/TrendChart';
import { Button } from '../../ui/Button';
import { Card, Figure, Heading, Rows } from '../../ui/Card';
import { Choices } from '../../ui/Choices';
import { ScreenHeader } from '../../ui/HeaderButton';
import { ListRow } from '../../ui/ListRow';
import { RateNotes } from '../../ui/RateNotes';
import { ScrollScreen } from '../../ui/ScrollScreen';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { Toggle } from '../../ui/Toggle';

/** How each type is named in report strings and chart colors. */
const TYPE_KEY = { INCOME: 'income', EXPENSE: 'expense' } as const;
const CHART_COLOR = { INCOME: 'chartIncome', EXPENSE: 'chartExpense' } as const;

function PeriodPicker({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const { t } = useI18n();
  const format = useFormatters();
  const monthly = period.kind === 'month';
  const current = format.currentPeriod(new Date());
  return (
    <View style={styles.part}>
      <Choices
        label={t('reports.periodKind')}
        choices={[
          { id: 'month', label: t('reports.month') },
          { id: 'year', label: t('reports.year') },
        ]}
        selected={period.kind}
        onSelect={(kind) => {
          if (kind === period.kind) return;
          if (kind === 'year') return onChange({ kind: 'year', year: period.year });
          onChange(
            period.year === current.year
              ? current
              : { kind: 'month', year: period.year, month: 12 },
          );
        }}
      />
      <View style={styles.months}>
        <Button
          label={t(monthly ? 'reports.previousMonth' : 'reports.previousYear')}
          onPress={() => onChange(previousPeriod(period))}
        />
        <Text bold accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.month}>
          {format.period(period)}
        </Text>
        <Button
          label={t(monthly ? 'reports.nextMonth' : 'reports.nextYear')}
          onPress={() => onChange(nextPeriod(period))}
        />
      </View>
    </View>
  );
}

function Summary({ report }: { report: Report }) {
  const { t } = useI18n();
  const shown = useShownInBase(report.baseCurrency);
  return (
    <Card>
      <Heading>{t('reports.summary')}</Heading>
      {(['income', 'expense', 'net'] as const).map((key) => (
        <Figure key={key} large label={t(`reports.${key}`)} value={shown(report[key])} />
      ))}
      <RateNotes ratesUsed={report.ratesUsed} missing={report.missing} day={report.rateDay} />
    </Card>
  );
}

function Trend({ report }: { report: Report }) {
  const { t } = useI18n();
  const format = useFormatters();
  const shown = useShownInBase(report.baseCurrency);
  const [listed, setListed] = useState(false);
  return (
    <View style={styles.part}>
      <Heading>{t('reports.trend')}</Heading>
      <Text size="sm" tone="foregroundMuted">
        {t('reports.trendIntro')}
      </Text>
      <Card>
        <TrendChart trend={report.trend} baseCurrency={report.baseCurrency} />
        <Toggle label={t('reports.showTable')} value={listed} onChange={setListed} />
        {listed && (
          <Rows>
            {/* Newest first, like the app's other lists. */}
            {[...report.trend].reverse().map((point) => (
              <ListRow
                key={periodParam(point.month)}
                title={format.period(point.month)}
                lines={[
                  ...(['income', 'expense', 'net'] as const).map((key) =>
                    t('reports.figure', { name: t(`reports.${key}`), amount: shown(point[key]) }),
                  ),
                  point.missing.length > 0 &&
                    t('reports.trendMissing', {
                      currencies: point.missing
                        .map((code) => format.currency(currencyByCode(code)))
                        .join(t('totals.separator')),
                    }),
                ]}
              />
            ))}
          </Rows>
        )}
      </Card>
    </View>
  );
}

function CategoryBreakdown({
  type,
  report,
  categories,
}: {
  type: TransactionType;
  report: Report;
  categories: readonly Category[];
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const shown = useShownInBase(report.baseCurrency);
  const share = useShare();
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? '';
  const lines = report.categories.filter((line) => line.type === type);
  if (lines.length === 0) return null;

  return (
    <View style={styles.part}>
      <Heading>{t('reports.byCategory', { type: t(`reports.${TYPE_KEY[type]}`) })}</Heading>
      <Rows>
        {lines.map((line) => {
          const name = nameOf(line.categoryId);
          return (
            <ListRow
              key={line.categoryId}
              title={name}
              trailing={`${shown(line.total)} · ${share(line.share)}`}
              lines={[
                line.children.length > 0 &&
                  line.own !== 0n &&
                  t('reports.figure', {
                    name: t('reports.ownLine', { name: isolate(name) }),
                    amount: shown(line.own),
                  }),
                ...line.children.map((child) =>
                  t('reports.figure', {
                    name: nameOf(child.categoryId),
                    amount: `${shown(child.total)} · ${share(child.share)}`,
                  }),
                ),
              ]}
            >
              <View style={styles.bar}>
                <ShareBar percent={line.share} color={colors[CHART_COLOR[type]]} />
              </View>
            </ListRow>
          );
        })}
      </Rows>
    </View>
  );
}

function LabelBreakdown({ report, labels }: { report: Report; labels: readonly Label[] }) {
  const { t } = useI18n();
  const shown = useShownInBase(report.baseCurrency);
  const share = useShare();
  const nameOf = (id: string) => labels.find((l) => l.id === id)?.name ?? '';
  const amount = (key: 'expense' | 'income', value: bigint, percent?: number) =>
    value !== 0n &&
    t('reports.figure', {
      name: t(`reports.${key}`),
      amount: percent === undefined ? shown(value) : `${shown(value)} · ${share(percent)}`,
    });

  return (
    <View style={styles.part}>
      <Heading>{t('reports.byLabel')}</Heading>
      <Text size="sm" tone="foregroundMuted">
        {t('reports.byLabelIntro')}
      </Text>
      {report.labels.length === 0 ? (
        <Text tone="foregroundMuted">{t('reports.noLabels')}</Text>
      ) : (
        <Rows>
          {[
            ...report.labels.map((line) => (
              <ListRow
                key={line.labelId}
                title={nameOf(line.labelId)}
                lines={[
                  amount('expense', line.expense, line.expenseShare),
                  amount('income', line.income, line.incomeShare),
                ]}
              />
            )),
            <ListRow
              key="unlabeled"
              title={t('reports.unlabeled')}
              lines={[
                amount('expense', report.unlabeled.expense),
                amount('income', report.unlabeled.income),
              ]}
            />,
          ]}
        </Rows>
      )}
    </View>
  );
}

/**
 * The Period's Income, Expense and net (this month to start with), the trend
 * of the months up to it, Category and Label breakdowns, and spending under
 * Controllable Labels with what cutting it would save, in the Base Currency.
 * Every Member sees them.
 */
export default function ReportsScreen() {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const [period, setPeriod] = useState<Period>(() => format.currentPeriod(new Date()));
  const report = useReport(period);
  const categories = useCategories();
  const labels = useLabels();
  const categoryList = categories.data;

  return (
    <>
      <ScreenHeader title={t('reports.title')} />
      <ScrollScreen refreshing={report.isRefetching} onRefresh={() => void report.refetch()}>
        <Text size="sm" tone="foregroundMuted">
          {t('reports.intro', { base: format.currency(currencyByCode(workspace.baseCurrency)) })}
        </Text>
        <PeriodPicker period={period} onChange={setPeriod} />
        {report.isPending || categories.isPending || labels.isPending ? (
          <Text tone="foregroundMuted">{t('session.loading')}</Text>
        ) : !report.data || !categoryList || !labels.data ? (
          <Text tone="danger" accessibilityRole="alert">
            {t('reports.loadFailed')}
          </Text>
        ) : (
          <>
            <Summary report={report.data} />
            <Trend report={report.data} />
            {report.data.categories.length === 0 ? (
              <Text tone="foregroundMuted">{t('reports.empty')}</Text>
            ) : (
              <>
                {(['EXPENSE', 'INCOME'] as const).map((type) => (
                  <CategoryBreakdown
                    key={type}
                    type={type}
                    report={report.data}
                    categories={categoryList}
                  />
                ))}
                <LabelBreakdown report={report.data} labels={labels.data} />
              </>
            )}
            <ControllableSpending report={report.data} labels={labels.data} />
          </>
        )}
      </ScrollScreen>
    </>
  );
}

const styles = StyleSheet.create({
  part: { gap: nativeTheme.space(2) },
  months: { flexDirection: 'row', alignItems: 'center', gap: nativeTheme.space(2) },
  month: { flex: 1, textAlign: 'center' },
  bar: { width: 64 },
});
