import {
  controllableSavings,
  currencyByCode,
  DEFAULT_SAVINGS_PERCENT,
  periodParam,
} from '@daric/core';
import type { Label, Report } from '@daric/core';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { useShare, useShownInBase } from './reports';

/** The slider moves in steps of this many percent. */
const SAVINGS_STEP = 5;

/** A month's controllable Expense against the largest month's, as a thin bar. */
function MonthBar({ expense, largest }: { expense: bigint; largest: bigint }) {
  const width = largest === 0n ? 0 : Number((expense * 100n) / largest);
  return (
    <span aria-hidden="true" className="block h-1.5 w-full rounded-full bg-surface-muted">
      <span
        className="block h-full rounded-full"
        style={{ width: `${width}%`, background: 'var(--color-chart-expense)' }}
      />
    </span>
  );
}

function Savings({
  controllable,
  baseCurrency,
}: {
  controllable: Report['controllable'];
  baseCurrency: string;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const sliderId = useId();
  const basisId = useId();
  const [percent, setPercent] = useState(DEFAULT_SAVINGS_PERCENT);
  const shown = useShownInBase(baseCurrency);
  const percentText = useShare()(percent);
  const average = shown(controllable.monthlyAverage);
  const savings = controllableSavings(controllable.monthlyAverage, percent);

  if (controllable.monthsAveraged === 0) {
    return <p className="text-sm text-foreground-muted">{t('reports.savingsNoBasis')}</p>;
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-muted px-4 py-3">
      <h3 className="font-bold">{t('reports.savings')}</h3>
      <div className="flex items-center gap-3">
        <label htmlFor={sliderId} className="text-sm font-medium">
          {t('reports.savingsSlider')}
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          step={SAVINGS_STEP}
          value={percent}
          onChange={(e) => {
            setPercent(Number(e.target.value));
          }}
          aria-valuetext={percentText}
          aria-describedby={basisId}
          className="grow accent-primary"
        />
        <span aria-hidden="true" className="w-12 text-end font-bold tabular-nums">
          {percentText}
        </span>
      </div>
      <p id={basisId} className="text-sm text-foreground-muted">
        {controllable.averageRunning
          ? t('reports.savingsBasisRunning', { average })
          : t('reports.savingsBasis', {
              months: format.count(controllable.monthsAveraged),
              average,
            })}
      </p>
      <div role="status">
        <dl className="grid grid-cols-2 gap-4 tabular-nums">
          {(
            [
              ['savingsMonthly', savings.monthly],
              ['savingsYearly', savings.yearly],
            ] as const
          ).map(([key, amount]) => (
            <div key={key} className="flex flex-col gap-1">
              <dt className="text-sm text-foreground-muted">{t(`reports.${key}`)}</dt>
              <dd className="text-xl font-bold">{shown(amount)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
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
  const format = useFormatters();
  const titleId = useId();
  const { controllable } = report;
  const shown = useShownInBase(report.baseCurrency);
  const share = useShare();
  const nameOf = (id: string) => labels.find((l) => l.id === id)?.name ?? '';
  const largest = controllable.trend.reduce((max, p) => (p.expense > max ? p.expense : max), 0n);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-lg font-bold">
        {t('reports.controllable')}
      </h2>
      {!labels.some((label) => label.controllable) ? (
        <p className="text-foreground-muted">
          {t('reports.controllableNone')}{' '}
          <Link to="/labels" className="font-medium text-primary underline">
            {t('reports.controllableLabelsLink')}
          </Link>
        </p>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">{t('reports.controllableIntro')}</p>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-4">
            <dl className="grid grid-cols-2 gap-4 tabular-nums">
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-foreground-muted">{t('reports.controllableTotal')}</dt>
                <dd className="text-2xl font-bold">{shown(controllable.expense)}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-foreground-muted">{t('reports.controllableShare')}</dt>
                <dd className="text-2xl font-bold">{share(controllable.share)}</dd>
              </div>
            </dl>
            <Savings controllable={controllable} baseCurrency={report.baseCurrency} />
            {controllable.labels.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <caption className="sr-only">{t('reports.controllableByLabel')}</caption>
                  <thead>
                    <tr className="border-b border-border text-foreground-muted">
                      <th scope="col" className="py-2 text-start font-medium">
                        {t('reports.label')}
                      </th>
                      <th scope="col" className="py-2 text-end font-medium">
                        {t('reports.amount')}
                      </th>
                      <th scope="col" className="py-2 text-end font-medium">
                        {t('reports.shareColumn')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {controllable.labels.map((line) => (
                      <tr key={line.labelId}>
                        <th scope="row" className="py-2 text-start font-medium">
                          {nameOf(line.labelId)}
                        </th>
                        <td className="py-2 text-end">{shown(line.expense)}</td>
                        <td className="py-2 text-end">{share(line.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <caption className="pb-2 text-start font-bold">
                  {t('reports.controllableTrend')}
                </caption>
                <thead>
                  <tr className="border-b border-border text-foreground-muted">
                    <th scope="col" className="py-2 text-start font-medium">
                      {t('reports.monthColumn')}
                    </th>
                    <th scope="col" className="w-40 py-2 text-end font-medium">
                      {t('reports.amount')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {/* Newest first, like the trend table above. */}
                  {[...controllable.trend].reverse().map((point) => (
                    <tr key={periodParam(point.month)}>
                      <th scope="row" className="py-2 text-start font-normal">
                        {format.period(point.month)}
                        {point.missing.length > 0 && (
                          <span className="block text-xs text-foreground-muted">
                            {t('reports.trendMissing', {
                              currencies: point.missing
                                .map((code) => format.currency(currencyByCode(code)))
                                .join(t('list.separator')),
                            })}
                          </span>
                        )}
                      </th>
                      <td className="py-2 ps-4">
                        <span className="flex flex-col items-end gap-1">
                          {shown(point.expense)}
                          <MonthBar expense={point.expense} largest={largest} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
