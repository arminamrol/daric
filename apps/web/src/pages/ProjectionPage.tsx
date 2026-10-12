import { currencyByCode, hasRole, money, projectionModes, transactionTypes } from '@daric/core';
import type { ProjectionMode, ProjectionReport, TransactionType } from '@daric/core';
import { isolate } from '@daric/i18n';
import { Plus, TriangleAlert } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';
import { TrailingMonthsForm } from '../projection/TrailingMonthsForm';
import { usePlannedItems } from '../projection/planned-items';
import {
  useProjection,
  useProjectionSettings,
  useUpdateProjectionSettings,
} from '../projection/projection';
import { RateNotes } from '../rates/RateNotes';
import { useFormatters } from '../settings/settings';
import { categoryChoices } from '../transactions/choices';
import { ChoiceGroup } from '../ui/ChoiceGroup';

type Figures = ProjectionReport['income'];

const FIGURES_OF = { INCOME: 'income', EXPENSE: 'expense' } as const;

/** An Amount in the report's Base Currency, as shown. */
function useShownInBase(baseCurrency: string) {
  const format = useFormatters();
  const base = currencyByCode(baseCurrency);
  return (amount: bigint) => format.money(money(amount, base));
}

/** `parent › child` names by Category id; archived ones keep theirs. */
function useCategoryNames() {
  const { t } = useI18n();
  const categories = useCategories();
  const names = useMemo(
    () =>
      new Map(categoryChoices(categories.data ?? [], t).map((choice) => [choice.id, choice.label])),
    [categories.data, t],
  );
  return (categoryId: string | null) =>
    categoryId === null ? t('projection.uncategorized') : (names.get(categoryId) ?? '');
}

type NameOf = ReturnType<typeof useCategoryNames>;

function TypeTotals({
  type,
  mode,
  figures,
  base,
}: {
  type: TransactionType;
  mode: ProjectionMode;
  figures: Figures;
  base: string;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const shown = useShownInBase(base);
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
        {mode !== 'MANUAL' && (
          <>
            <dt className="text-foreground-muted">{t('projection.variable')}</dt>
            <dd>{shown(figures.variable)}</dd>
            <dt className="text-foreground-muted">{t('projection.recurring')}</dt>
            <dd>{shown(figures.recurring)}</dd>
          </>
        )}
        {mode !== 'AUTOMATIC' && (
          <>
            <dt className="text-foreground-muted">{t('projection.planned')}</dt>
            <dd>{shown(figures.planned)}</dd>
          </>
        )}
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
  nameOf: NameOf;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const shown = useShownInBase(projection.baseCurrency);
  const detail = (line: ProjectionReport['categories'][number]) => {
    const amounts = {
      actual: isolate(shown(line.actual)),
      variable: isolate(shown(line.variable)),
      recurring: isolate(shown(line.recurring)),
      planned: isolate(shown(line.planned)),
    };
    if (projection.mode === 'MANUAL') return t('projection.categoryDetailManual', amounts);
    if (projection.mode === 'COMBINED') return t('projection.categoryDetailCombined', amounts);
    return t('projection.categoryDetail', amounts);
  };
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
            key={line.categoryId ?? ''}
            aria-label={nameOf(line.categoryId)}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 tabular-nums"
          >
            <span className="me-auto font-medium">{nameOf(line.categoryId)}</span>
            <span className="font-medium">{shown(line.projected)}</span>
            <span className="w-full text-sm text-foreground-muted">{detail(line)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Assumptions({ projection, nameOf }: { projection: ProjectionReport; nameOf: NameOf }) {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const settings = useProjectionSettings();
  const titleId = useId();
  const averagesId = useId();
  const recurringId = useId();
  const plannedId = useId();
  const shown = useShownInBase(projection.baseCurrency);
  const { mode, remaining, window, monthsUsed } = projection;
  const averaging = mode !== 'MANUAL';
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
        {averaging && monthsUsed > 0 && (
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
      {averaging &&
        settings.data &&
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
      {averaging && (
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
      )}
      {averaging && (
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
      )}
      {mode !== 'AUTOMATIC' && (
        <div className="flex flex-col gap-2">
          <h3 id={plannedId} className="font-bold">
            {t('projection.plannedList')}
          </h3>
          {projection.planned.length === 0 ? (
            <p className="text-sm text-foreground-muted">{t('projection.noPlanned')}</p>
          ) : (
            <ul aria-labelledby={plannedId} className="flex flex-col gap-1 text-sm tabular-nums">
              {projection.planned.map((item) => (
                <li key={item.itemId} aria-label={item.name} className="flex flex-wrap gap-x-3">
                  <span className="me-auto">
                    {item.name}
                    <span className="text-foreground-muted">
                      {' · '}
                      {nameOf(item.categoryId)}
                    </span>
                  </span>
                  <span>
                    {t('projection.occurrences', {
                      count: format.count(item.occurrences.length),
                      total: isolate(shown(item.total)),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** Every Planned Item, with a way in to change it or add one for Owners and Admins. */
function PlannedItems({ nameOf }: { nameOf: NameOf }) {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const items = usePlannedItems();
  const titleId = useId();
  const mayChange = hasRole(workspace.role, 'ADMIN');

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <h2 id={titleId} className="me-auto text-lg font-bold">
          {t('plannedItems.title')}
        </h2>
        {mayChange && (
          <Link
            to="/projection/planned/new"
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary"
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
            {t('plannedItems.new')}
          </Link>
        )}
      </div>
      <p className="text-sm text-foreground-muted">{t('plannedItems.intro')}</p>
      {items.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : items.isError ? (
        <p role="alert" className="text-danger">
          {t('plannedItems.loadFailed')}
        </p>
      ) : items.data.length === 0 ? (
        <p className="text-foreground-muted">{t('plannedItems.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {items.data.map((item) => {
            const amount = isolate(format.money(money(item.amount, currencyByCode(item.currency))));
            const start = isolate(format.day(item.startOn));
            const when =
              item.kind === 'ONE_OFF'
                ? t('plannedItems.once', { amount, day: start })
                : item.endOn
                  ? t('plannedItems.monthlyUntil', {
                      amount,
                      start,
                      end: isolate(format.day(item.endOn)),
                    })
                  : t('plannedItems.monthly', { amount, start });
            return (
              <li
                key={item.id}
                aria-label={item.name}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
              >
                <span className="me-auto font-medium">{item.name}</span>
                {mayChange && (
                  <Link
                    to={`/projection/planned/${item.id}`}
                    className="text-sm font-medium text-accent underline underline-offset-4"
                  >
                    {t('plannedItems.edit', { name: isolate(item.name) })}
                  </Link>
                )}
                <span className="w-full text-sm text-foreground-muted tabular-nums">
                  {t(`plannedItems.kind.${item.kind}`)}
                  {' · '}
                  {t(`projection.type.${item.type}`)}
                  {' · '}
                  {nameOf(item.categoryId)}
                  {' · '}
                  {when}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Which mode the Projection is shown in; an Owner's or Admin's choice is kept for everyone. */
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: ProjectionMode;
  onChange: (mode: ProjectionMode) => void;
}) {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const update = useUpdateProjectionSettings();
  const hintId = useId();

  return (
    <div className="flex flex-col gap-1">
      <ChoiceGroup
        legend={t('projection.mode')}
        choices={projectionModes.map((value) => ({ value, label: t(`projection.mode.${value}`) }))}
        value={mode}
        describedBy={hintId}
        onChange={(value) => {
          onChange(value);
          if (hasRole(workspace.role, 'ADMIN')) update.mutate({ mode: value });
        }}
      />
      <p id={hintId} className="text-sm text-foreground-muted">
        {t(`projection.modeHint.${mode}`)}
      </p>
      {update.isError && (
        <p role="alert" className="text-sm text-danger">
          {t('projection.modeFailed')}
        </p>
      )}
    </div>
  );
}

/**
 * `/projection`: every Member sees the Projection of the current year in the
 * mode they choose (the Workspace's at first), its breakdown by Category,
 * every assumption behind it and the Planned Items. Owners and Admins set the
 * Workspace's mode and how many months the Trailing Average looks back over,
 * and enter Planned Items.
 */
export function ProjectionPage() {
  const { t } = useI18n();
  const format = useFormatters();
  const [mode, setMode] = useState<ProjectionMode>();
  const projection = useProjection(mode);
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
              base: format.currency(currencyByCode(data.baseCurrency)),
            })}
          </p>
          <ModeSwitch mode={mode ?? data.mode} onChange={setMode} />
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
                mode={data.mode}
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
          <PlannedItems nameOf={nameOf} />
        </>
      )}
    </div>
  );
}
