import { hasRole, monthParamSchema, nextPeriod, periodParam, previousPeriod } from '@daric/core';
import type { MonthPeriod } from '@daric/core';
import { useId } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSignedIn } from '../auth/session';
import { BudgetCard } from '../budgets/BudgetCard';
import { useBudgets } from '../budgets/budgets';
import { useBudgetNames } from '../budgets/names';
import { useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';
import { useLabels } from '../labels/labels';
import { useFormatters } from '../settings/settings';

/**
 * `/budgets` (`?month=1405-07`, the current month by default): every Budget
 * with its progress in that month, or in the year holding it for a yearly
 * one. Every Member sees them; Owners and Admins change them.
 */
export function BudgetsPage() {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const [params] = useSearchParams();
  const listLabelId = useId();
  const parsed = monthParamSchema.safeParse(params.get('month') ?? '');
  const month: MonthPeriod = parsed.success ? parsed.data : format.currentPeriod(new Date());
  const budgets = useBudgets(month);
  const categories = useCategories();
  const labels = useLabels();
  const names = useBudgetNames(categories.data, labels.data);
  const canManage = hasRole(workspace.role, 'ADMIN');

  const monthLink = (to: MonthPeriod) => `?month=${periodParam(to)}`;
  const loading = budgets.isPending || categories.isPending || labels.isPending;
  const failed = budgets.isError || categories.isError || labels.isError;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-2xl font-bold">{t('budgets.title')}</h1>
        {canManage && (
          <Link
            to="/budgets/new"
            className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary"
          >
            {t('budgets.new')}
          </Link>
        )}
      </div>
      {!canManage && <p className="text-sm text-foreground-muted">{t('budgets.readOnly')}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <p id={listLabelId} className="me-auto text-xl font-bold">
          {format.period(month)}
        </p>
        <nav className="flex gap-2 text-sm">
          <Link
            to={monthLink(previousPeriod(month))}
            className="rounded-md border border-border px-3 py-1"
          >
            {t('budgets.previousMonth')}
          </Link>
          <Link
            to={monthLink(nextPeriod(month))}
            className="rounded-md border border-border px-3 py-1"
          >
            {t('budgets.nextMonth')}
          </Link>
        </nav>
      </div>
      {loading ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : failed ? (
        <p role="alert" className="text-danger">
          {t('budgets.loadFailed')}
        </p>
      ) : budgets.data.length === 0 ? (
        <p className="text-foreground-muted">{t('budgets.empty')}</p>
      ) : (
        <ul aria-labelledby={listLabelId} className="flex flex-col gap-3">
          {budgets.data.map((budget) => (
            <li key={budget.id}>
              <BudgetCard
                budget={budget}
                name={names(budget)}
                category={categories.data.find((c) => c.id === budget.categoryId)}
                canManage={canManage}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
