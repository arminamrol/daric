import { currencyByCode, hasRole, money, transactionTypes } from '@daric/core';
import type { ProjectionReport, TransactionType } from '@daric/core';
import { isolate } from '@daric/i18n';
import { TriangleAlert } from 'lucide-react';
import { useId, useMemo } from 'react';
import { useSignedIn } from '../auth/session';
import { useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';
import { TrailingMonthsForm } from '../projection/TrailingMonthsForm';
import { useProjection, useProjectionSettings } from '../projection/projection';
import { RateNotes } from '../rates/RateNotes';
import { useFormatters } from '../settings/settings';
import { categoryChoices } from '../transactions/choices';

type Figures = ProjectionReport['income'];

const FIGURES_OF = { INCOME: 'income', EXPENSE: 'expense' } as const;

/** `parent › child` names by Category id; archived ones keep theirs. */
function useCategoryNames() {
  const { t } = useI18n();
  const categories = useCategories();
  const names = useMemo(
    () =>
      new Map(categoryChoices(categories.data ?? [], t).map((choice) => [choice.id, choice.label])),
    [categories.data, t],
  );
  return (categoryId: string) => names.get(categoryId) ?? '';
}

function TypeTotals({
  type,
  figures,
  base,
}: {
  type: TransactionType;
  figures: Figures;
  base: string;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const titleId = useId();
  const shown = (amount: bigint) => format.money(money(amount, currencyByCode(base)));
  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-2">
      <h3 id={titleId} className="font-bold">
        {t(`projection.type.${type}`)}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 tabular-nums">
        <dt className="font-medium">{t('projection.projected')}</dt>
        <dd className="text-2xl font-bold">{shown(figures.projected)}</dd>
        <dt className="text-foreground-muted">{t('projection.actual')}</dt>
        <dd>{shown(figures.actual)}</dd>
        <dt className="text-foreground-muted">{t('projection.variable')}</dt>
        <dd>{shown(figures.variable)}</dd>
        <dt className="text-foreground-muted">{t('projection.recurring')}</dt>
        <dd>{shown(figures.recurring)}</dd>
      </dl>
    </article>
  );
}

function CategoryBreakdown({
  type,
  projection,
  nameOf,
}: {
  type: TransactionType;
  projection: ProjectionReport;
  nameOf: (categoryId: string) => string;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const titleId = useId();
  const base = currencyByCode(projection.baseCurrency);
  const shown = (amount: bigint) => format.money(money(amount, base));
  const lines = projection.categories
    .filter((c) => c.type === type)
    .sort((a, b) => (a.projected < b.projected ? 1 : a.projected > b.projected ? -1 : 0));
  if (lines.length === 0) return null;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-lg font-bold">
        {t('projection.byCategory', { type: t(`projection.type.${type}`) })}
      </h2>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {lines.map((line) => (
          <li
            key={line.categoryId}
            aria-label={nameOf(line.categoryId)}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 tabular-nums"
          >
            <span className="me-auto font-medium">{nameOf(line.categoryId)}</span>
            <span className="font-medium">{shown(line.projected)}</span>
            <span className="w-full text-sm text-foreground-muted">
              {t('projection.categoryDetail', {
                actual: isolate(shown(line.actual)),
                variable: isolate(shown(line.variable)),
                recurring: isolate(shown(line.recurring)),
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Assumptions({
  projection,
  nameOf,
}: {
  projection: ProjectionReport;
  nameOf: (categoryId: string) => string;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const settings = useProjectionSettings();
  const titleId = useId();
  const averagesId = useId();
  const recurringId = useId();
  const base = currencyByCode(projection.baseCurrency);
  const shown = (amount: bigint) => format.money(money(amount, base));
  const { remaining, window, monthsUsed } = projection;
  const used = window.slice(window.length - monthsUsed);
  const months = used.map((p) => isolate(format.period(p))).join(t('totals.separator'));
  const averages = projection.categories.filter((c) => c.average !== 0n);

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-5"
    >
      <h2 id={titleId} className="text-lg font-bold">
        {t('projection.assumptions')}
      </h2>
      <div className="flex flex-col gap-1 text-sm">
        <p>
          {t('projection.remaining', {
            months: format.count(remaining.fullMonths),
            days: format.count(remaining.daysLeftInMonth),
            monthDays: format.count(remaining.daysInMonth),
          })}
        </p>
        {monthsUsed > 0 && (
          <p>
            {t(monthsUsed === window.length ? 'projection.window' : 'projection.windowShort', {
              months,
            })}
          </p>
        )}
        {projection.warnings.map((warning) =>
          warning.kind === 'missing_rates' ? null : (
            <p key={warning.kind} className="flex items-center gap-x-2 text-accent">
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
              <span>
                {warning.kind === 'short_history'
                  ? t('projection.warning.short_history', {
                      used: format.count(warning.monthsUsed),
                      wanted: format.count(warning.monthsWanted),
                    })
                  : t('projection.warning.no_history')}
              </span>
            </p>
          ),
        )}
        <RateNotes
          ratesUsed={projection.ratesUsed}
          missing={projection.missing.map(currencyByCode)}
          day={projection.today}
        />
      </div>
      {settings.data &&
        (hasRole(workspace.role, 'ADMIN') ? (
          <TrailingMonthsForm
            key={settings.data.version}
            trailingMonths={settings.data.trailingMonths}
          />
        ) : (
          <p className="text-sm text-foreground-muted">
            {t('projection.trailingMonthsReadOnly', {
              count: format.count(settings.data.trailingMonths),
            })}
          </p>
        ))}
      <div className="flex flex-col gap-2">
        <h3 id={averagesId} className="font-bold">
          {t('projection.averages')}
        </h3>
        {averages.length === 0 ? (
          <p className="text-sm text-foreground-muted">{t('projection.noAverages')}</p>
        ) : (
          <ul aria-labelledby={averagesId} className="flex flex-col gap-1 text-sm tabular-nums">
            {averages.map((line) => (
              <li key={`${line.type}|${line.categoryId}`} className="flex gap-3">
                <span className="me-auto">{nameOf(line.categoryId)}</span>
                <span>{shown(line.average)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 id={recurringId} className="font-bold">
          {t('projection.recurringList')}
        </h3>
        {projection.recurring.length === 0 ? (
          <p className="text-sm text-foreground-muted">{t('projection.noRecurring')}</p>
        ) : (
          <ul aria-labelledby={recurringId} className="flex flex-col gap-1 text-sm tabular-nums">
            {projection.recurring.map((rule) => (
              <li key={rule.ruleId} aria-label={rule.name} className="flex flex-wrap gap-x-3">
                <span className="me-auto">
                  {rule.name}
                  <span className="text-foreground-muted">
                    {' · '}
                    {nameOf(rule.categoryId)}
                  </span>
                </span>
                <span>
                  {t('projection.occurrences', {
                    count: format.count(rule.occurrences.length),
                    total: isolate(shown(rule.total)),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * `/projection`: every Member sees the Automatic Projection of the current
 * year, its breakdown by Category and every assumption behind it; Owners and
 * Admins choose how many months the Trailing Average looks back over.
 */
export function ProjectionPage() {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const projection = useProjection();
  const nameOf = useCategoryNames();
  const totalsId = useId();
  const data = projection.data;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('projection.title')}</h1>
      {projection.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : projection.isError || !data ? (
        <p role="alert" className="text-danger">
          {t('projection.loadFailed')}
        </p>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            {t('projection.intro', {
              year: format.count(data.year),
              yearEnd: isolate(format.day(data.yearEnd)),
              today: isolate(format.day(data.today)),
              base: format.currency(currencyByCode(workspace.baseCurrency)),
            })}
          </p>
          <section
            aria-labelledby={totalsId}
            className="grid gap-6 rounded-xl border border-border bg-surface px-6 py-5 sm:grid-cols-2"
          >
            <h2 id={totalsId} className="sr-only">
              {t('projection.totals')}
            </h2>
            {transactionTypes.map((type) => (
              <TypeTotals
                key={type}
                type={type}
                figures={data[FIGURES_OF[type]]}
                base={data.baseCurrency}
              />
            ))}
          </section>
          {data.categories.length === 0 ? (
            <p className="text-foreground-muted">{t('projection.empty')}</p>
          ) : (
            transactionTypes.map((type) => (
              <CategoryBreakdown key={type} type={type} projection={data} nameOf={nameOf} />
            ))
          )}
          <Assumptions projection={data} nameOf={nameOf} />
        </>
      )}
    </div>
  );
}
