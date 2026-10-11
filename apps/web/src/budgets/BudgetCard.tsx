import { money } from '@daric/core';
import type { Budget, BudgetState, Category } from '@daric/core';
import { isolate } from '@daric/i18n';
import type { PlainMessageKey } from '@daric/i18n';
import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { currencyOf } from '../accounts/accounts';
import { CategoryBadge } from '../categories/CategoryBadge';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { BUDGET_PERIOD_LABELS } from './labels';

/** Each state has its own words and icon, so color is never the only sign. */
const STATES: Record<
  BudgetState,
  { label: PlainMessageKey; icon: LucideIcon; tone: string; bar: string }
> = {
  ok: { label: 'budgets.state.ok', icon: CircleCheck, tone: 'text-success', bar: 'bg-success' },
  warning: {
    label: 'budgets.state.warning',
    icon: TriangleAlert,
    tone: 'text-accent',
    bar: 'bg-primary',
  },
  over: { label: 'budgets.state.over', icon: CircleAlert, tone: 'text-danger', bar: 'bg-danger' },
};

/** One Budget with a progress bar for the Period it is shown in. */
export function BudgetCard({
  budget,
  name,
  category,
  canManage,
}: {
  budget: Budget;
  name: string;
  category: Category | undefined;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const nameId = useId();
  const { progress } = budget;
  const currency = currencyOf(budget);
  const amount = (value: bigint) => format.money(money(value, currency));
  const state = STATES[progress.state];
  const StateIcon = state.icon;
  const spentOf = t('budgets.spentOf', {
    spent: isolate(amount(progress.spent)),
    limit: isolate(amount(budget.amount)),
  });
  const filled = Math.min(progress.percent, 100);

  return (
    <article
      aria-labelledby={nameId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4"
    >
      <div className="flex items-center gap-3">
        {category && <CategoryBadge icon={category.icon} color={category.color} size="sm" />}
        <div className="me-auto flex flex-col">
          <h2 className="font-medium">
            {canManage ? (
              <Link
                to={`/budgets/${budget.id}`}
                aria-label={t('budgets.edit', { name: isolate(name) })}
                className="underline-offset-4 hover:underline"
              >
                <span id={nameId}>{name}</span>
              </Link>
            ) : (
              <span id={nameId}>{name}</span>
            )}
          </h2>
          <p className="text-sm text-foreground-muted">
            {t('budgets.periodOf', {
              period: t(BUDGET_PERIOD_LABELS[budget.period]),
              name: format.period(progress.period),
            })}
          </p>
        </div>
      </div>
      <div
        role="progressbar"
        aria-labelledby={nameId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={filled}
        aria-valuetext={t('budgets.progress', {
          spent: isolate(amount(progress.spent)),
          limit: isolate(amount(budget.amount)),
          state: t(state.label),
        })}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className={`h-full rounded-full ${state.bar}`} style={{ inlineSize: `${filled}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="me-auto">{spentOf}</span>
        <span className={`inline-flex items-center gap-1 font-medium ${state.tone}`}>
          <StateIcon aria-hidden="true" className="size-4" strokeWidth={2} />
          {t(state.label)}
        </span>
      </div>
      <p className="text-sm text-foreground-muted">
        {progress.remaining < 0n
          ? t('budgets.overBy', { amount: isolate(amount(-progress.remaining)) })
          : t('budgets.remaining', { amount: isolate(amount(progress.remaining)) })}
      </p>
      {progress.otherCurrencyExpenses > 0 && (
        <p className="text-sm text-foreground-muted">{t('budgets.otherCurrency')}</p>
      )}
    </article>
  );
}
