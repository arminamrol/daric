import { hasRole } from '@daric/core';
import { Link, Navigate, useParams } from 'react-router';
import { useSignedIn } from '../auth/session';
import { BudgetForm } from '../budgets/BudgetForm';
import { useBudgets } from '../budgets/budgets';
import { useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';
import { useLabels } from '../labels/labels';
import { useFormatters } from '../settings/settings';

/** `/budgets/new` and `/budgets/:budgetId`: Owner and Admin only. */
export function BudgetFormPage() {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const { budgetId } = useParams();
  const categories = useCategories();
  const labels = useLabels();
  const budgets = useBudgets(format.currentPeriod(new Date()));

  if (!hasRole(workspace.role, 'ADMIN')) return <Navigate to="/budgets" replace />;
  if (categories.isPending || labels.isPending || (budgetId && budgets.isPending)) {
    return (
      <p role="status" className="text-center text-foreground-muted">
        {t('session.loading')}
      </p>
    );
  }
  const budget = budgetId ? budgets.data?.find((b) => b.id === budgetId) : undefined;
  const failed = categories.isError || labels.isError || (budgetId && budgets.isError);
  if (failed || (budgetId && !budget)) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p role="alert">{failed ? t('budgets.loadFailed') : t('budgets.notFound')}</p>
        <Link to="/budgets" className="font-medium text-accent underline underline-offset-4">
          {t('budgets.back')}
        </Link>
      </div>
    );
  }
  // Keyed so a different Budget starts from its own values.
  return (
    <BudgetForm
      key={budget?.id ?? 'new'}
      {...(budget && { budget })}
      categories={categories.data ?? []}
      labels={labels.data ?? []}
    />
  );
}
