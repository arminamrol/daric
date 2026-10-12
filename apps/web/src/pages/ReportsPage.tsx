import {
  currencyByCode,
  nextPeriod,
  periodParam,
  periodParamSchema,
  previousPeriod,
} from '@daric/core';
import type { Category, Label, Period, Report, TransactionType } from '@daric/core';
import { isolate } from '@daric/i18n';
import { lazy, Suspense, useId } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';
import { useLabels } from '../labels/labels';
import { RateNotes } from '../rates/RateNotes';
import { ControllableSpending } from '../reports/ControllableSpending';
import { useReport, useShare, useShownInBase } from '../reports/reports';
import { useFormatters } from '../settings/settings';

const TrendChart = lazy(() => import('../reports/TrendChart'));

/** How each type is named in report strings and chart colors. */
const TYPE_KEY = { INCOME: 'income', EXPENSE: 'expense' } as const;

/** A share of its type's total as a thin bar; the number beside it carries the value. */
function ShareBar({ share, type }: { share: number; type: TransactionType }) {
  return (
    <span aria-hidden="true" className="block h-1.5 w-full rounded-full bg-surface-muted">
      <span
        className="block h-full rounded-full"
        style={{
          width: `${Math.min(share, 100)}%`,
          background: `var(--color-chart-${TYPE_KEY[type]})`,
        }}
      />
    </span>
  );
}

function PeriodPicker({ period }: { period: Period }) {
  const { t } = useI18n();
  const format = useFormatters();
  const titleId = useId();
  const current = format.currentPeriod(new Date());
  const link = (to: Period) => `?period=${periodParam(to)}`;
  const asMonth: Period =
    period.kind === 'month'
      ? period
      : period.year === current.year
        ? current
        : { kind: 'month', year: period.year, month: 12 };
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1 ${active ? 'bg-surface-muted font-medium text-foreground' : 'text-foreground-muted hover:text-foreground'}`;
  const monthly = period.kind === 'month';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p id={titleId} className="me-auto text-xl font-bold">
        {format.period(period)}
      </p>
      <nav aria-label={t('reports.periodKind')} className="flex gap-1 text-sm">
        <Link
          to={link(asMonth)}
          aria-current={monthly ? 'page' : undefined}
          className={tab(monthly)}
        >
          {t('reports.month')}
        </Link>
        <Link
          to={link({ kind: 'year', year: period.year })}
          aria-current={monthly ? undefined : 'page'}
          className={tab(!monthly)}
        >
          {t('reports.year')}
        </Link>
      </nav>
      <nav aria-labelledby={titleId} className="flex gap-2 text-sm">
        <Link
          to={link(previousPeriod(period))}
          className="rounded-md border border-border px-3 py-1"
        >
          {t(monthly ? 'reports.previousMonth' : 'reports.previousYear')}
        </Link>
        <Link to={link(nextPeriod(period))} className="rounded-md border border-border px-3 py-1">
          {t(monthly ? 'reports.nextMonth' : 'reports.nextYear')}
        </Link>
      </nav>
    </div>
  );
}

function Summary({ report }: { report: Report }) {
  const { t } = useI18n();
  const titleId = useId();
  const shown = useShownInBase(report.baseCurrency);
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-6 py-5"
    >
      <h2 id={titleId} className="text-lg font-bold">
        {t('reports.summary')}
      </h2>
      <dl className="grid grid-cols-1 gap-4 tabular-nums sm:grid-cols-3">
        {(['income', 'expense', 'net'] as const).map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <dt className="text-sm text-foreground-muted">{t(`reports.${key}`)}</dt>
            <dd className="text-2xl font-bold">{shown(report[key])}</dd>
          </div>
        ))}
      </dl>
      <RateNotes
        ratesUsed={report.ratesUsed}
        missing={report.missing.map(currencyByCode)}
        day={report.rateDay}
      />
    </section>
  );
}

function TrendTable({ report }: { report: Report }) {
  const { t } = useI18n();
  const format = useFormatters();
  const shown = useShownInBase(report.baseCurrency);
  return (
    <table className="w-full text-sm tabular-nums">
      <caption className="sr-only">{t('reports.trendTable')}</caption>
      <thead>
        <tr className="border-b border-border text-foreground-muted">
          <th scope="col" className="py-2 text-start font-medium">
            {t('reports.monthColumn')}
          </th>
          {(['income', 'expense', 'net'] as const).map((key) => (
            <th key={key} scope="col" className="py-2 text-end font-medium">
              {t(`reports.${key}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {/* Newest first, like the app's other lists. */}
        {[...report.trend].reverse().map((point) => (
          <tr key={periodParam(point.month)}>
            <th scope="row" className="py-2 text-start font-normal">
              {format.period(point.month)}
              {point.missing.length > 0 && (
                <span className="block text-xs text-foreground-muted">
                  {t('reports.trendMissing', {
                    currencies: point.missing
                      .map((code) => format.currency(currencyByCode(code)))
                      .join(t('totals.separator')),
                  })}
                </span>
              )}
            </th>
            <td className="py-2 text-end">{shown(point.income)}</td>
            <td className="py-2 text-end">{shown(point.expense)}</td>
            <td className="py-2 text-end">{shown(point.net)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Trend({ report }: { report: Report }) {
  const { t } = useI18n();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-bold">
        {t('reports.trend')}
      </h2>
      <p className="text-sm text-foreground-muted">{t('reports.trendIntro')}</p>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4">
        <Suspense fallback={<div className="h-72 w-full" />}>
          <TrendChart trend={report.trend} baseCurrency={report.baseCurrency} />
        </Suspense>
        <details>
          <summary className="cursor-pointer text-sm font-medium">{t('reports.showTable')}</summary>
          <div className="mt-2 overflow-x-auto">
            <TrendTable report={report} />
          </div>
        </details>
      </div>
    </section>
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
  const titleId = useId();
  const shown = useShownInBase(report.baseCurrency);
  const share = useShare();
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? '';
  const lines = report.categories.filter((line) => line.type === type);
  if (lines.length === 0) return null;
  const typeName = t(`reports.${TYPE_KEY[type]}`);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-lg font-bold">
        {t('reports.byCategory', { type: typeName })}
      </h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface px-4 py-2">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">{t('reports.byCategoryTable', { type: typeName })}</caption>
          <thead>
            <tr className="border-b border-border text-foreground-muted">
              <th scope="col" className="py-2 text-start font-medium">
                {t('reports.category')}
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                {t('reports.amount')}
              </th>
              <th scope="col" className="w-28 py-2 text-end font-medium">
                {t('reports.shareColumn')}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <CategoryRows
                key={line.categoryId}
                line={line}
                type={type}
                nameOf={nameOf}
                shown={shown}
                share={share}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CategoryRows({
  line,
  type,
  nameOf,
  shown,
  share,
}: {
  line: Report['categories'][number];
  type: TransactionType;
  nameOf: (id: string) => string;
  shown: (amount: bigint) => string;
  share: (percent: number) => string;
}) {
  const { t } = useI18n();
  const name = nameOf(line.categoryId);
  const hasChildren = line.children.length > 0;
  return (
    <>
      <tr className="border-t border-border first:border-t-0">
        <th scope="row" className="py-2 text-start font-medium">
          {name}
        </th>
        <td className="py-2 text-end font-medium">{shown(line.total)}</td>
        <td className="py-2 ps-4">
          <span className="flex flex-col items-end gap-1">
            {share(line.share)}
            <ShareBar share={line.share} type={type} />
          </span>
        </td>
      </tr>
      {hasChildren && line.own !== 0n && (
        <tr className="text-foreground-muted">
          <th scope="row" className="py-1 ps-4 text-start font-normal">
            {t('reports.ownLine', { name: isolate(name) })}
          </th>
          <td className="py-1 text-end">{shown(line.own)}</td>
          <td />
        </tr>
      )}
      {line.children.map((child) => (
        <tr key={child.categoryId} className="text-foreground-muted">
          <th scope="row" className="py-1 ps-4 text-start font-normal">
            {t('transactions.categoryPath', {
              parent: isolate(name),
              child: isolate(nameOf(child.categoryId)),
            })}
          </th>
          <td className="py-1 text-end">{shown(child.total)}</td>
          <td className="py-1 text-end">{share(child.share)}</td>
        </tr>
      ))}
    </>
  );
}

function LabelBreakdown({ report, labels }: { report: Report; labels: readonly Label[] }) {
  const { t } = useI18n();
  const titleId = useId();
  const shown = useShownInBase(report.baseCurrency);
  const share = useShare();
  const nameOf = (id: string) => labels.find((l) => l.id === id)?.name ?? '';
  const amount = (value: bigint, percent: number) =>
    value === 0n ? '—' : `${shown(value)} · ${share(percent)}`;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-lg font-bold">
        {t('reports.byLabel')}
      </h2>
      <p className="text-sm text-foreground-muted">{t('reports.byLabelIntro')}</p>
      {report.labels.length === 0 ? (
        <p className="text-foreground-muted">{t('reports.noLabels')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface px-4 py-2">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">{t('reports.byLabel')}</caption>
            <thead>
              <tr className="border-b border-border text-foreground-muted">
                <th scope="col" className="py-2 text-start font-medium">
                  {t('reports.label')}
                </th>
                <th scope="col" className="py-2 text-end font-medium">
                  {t('reports.expense')}
                </th>
                <th scope="col" className="py-2 text-end font-medium">
                  {t('reports.income')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.labels.map((line) => (
                <tr key={line.labelId}>
                  <th scope="row" className="py-2 text-start font-medium">
                    {nameOf(line.labelId)}
                  </th>
                  <td className="py-2 text-end">{amount(line.expense, line.expenseShare)}</td>
                  <td className="py-2 text-end">{amount(line.income, line.incomeShare)}</td>
                </tr>
              ))}
              <tr className="text-foreground-muted">
                <th scope="row" className="py-2 text-start font-normal">
                  {t('reports.unlabeled')}
                </th>
                <td className="py-2 text-end">
                  {report.unlabeled.expense === 0n ? '—' : shown(report.unlabeled.expense)}
                </td>
                <td className="py-2 text-end">
                  {report.unlabeled.income === 0n ? '—' : shown(report.unlabeled.income)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * `/reports` (`?period=1405-07` for a month, `?period=1405` for a year; the
 * current month by default): the Period's Income, Expense and net, the trend
 * of the months up to it, Category and Label breakdowns, and spending under
 * Controllable Labels with a savings slider, in the Base Currency. Every Member sees them.
 */
export function ReportsPage() {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const [params] = useSearchParams();
  const parsed = periodParamSchema.safeParse(params.get('period') ?? '');
  const period: Period = parsed.success ? parsed.data : format.currentPeriod(new Date());
  const report = useReport(period);
  const categories = useCategories();
  const labels = useLabels();

  const loading = report.isPending || categories.isPending || labels.isPending;
  const failed = report.isError || categories.isError || labels.isError;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
        <p className="text-sm text-foreground-muted">
          {t('reports.intro', { base: format.currency(currencyByCode(workspace.baseCurrency)) })}
        </p>
      </div>
      <PeriodPicker period={period} />
      {loading ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : failed ? (
        <p role="alert" className="text-danger">
          {t('reports.loadFailed')}
        </p>
      ) : (
        <>
          <Summary report={report.data} />
          <Trend report={report.data} />
          {report.data.categories.length === 0 ? (
            <p className="text-foreground-muted">{t('reports.empty')}</p>
          ) : (
            <>
              {(['EXPENSE', 'INCOME'] as const).map((type) => (
                <CategoryBreakdown
                  key={type}
                  type={type}
                  report={report.data}
                  categories={categories.data}
                />
              ))}
              <LabelBreakdown report={report.data} labels={labels.data} />
            </>
          )}
          <ControllableSpending report={report.data} labels={labels.data} />
        </>
      )}
    </div>
  );
}
