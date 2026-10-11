import { hasRole } from '@daric/core';
import { Link, Navigate, useParams } from 'react-router';
import { useAccounts } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';
import { RecurringForm } from '../recurring/RecurringForm';
import { useRecurringRules } from '../recurring/recurring';

/** `/recurring/new` and `/recurring/:ruleId`: Owner and Admin only. */
export function RecurringFormPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const { ruleId } = useParams();
  const accounts = useAccounts({ includeArchived: true });
  const categories = useCategories();
  const rules = useRecurringRules();

  if (!hasRole(workspace.role, 'ADMIN')) return <Navigate to="/recurring" replace />;
  if (accounts.isPending || categories.isPending || (ruleId && rules.isPending)) {
    return (
      <p role="status" className="text-center text-foreground-muted">
        {t('session.loading')}
      </p>
    );
  }
  const rule = ruleId ? rules.data?.find((r) => r.id === ruleId) : undefined;
  const failed = accounts.isError || categories.isError || (ruleId && rules.isError);
  const noAccount = !rule && !accounts.data?.some((a) => !a.archived);
  if (failed || (ruleId && !rule) || noAccount) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p role="alert">
          {failed
            ? t('recurring.loadFailed')
            : noAccount
              ? t('transactions.noAccount')
              : t('recurring.notFound')}
        </p>
        <Link to="/recurring" className="font-medium text-accent underline underline-offset-4">
          {t('recurring.back')}
        </Link>
      </div>
    );
  }
  // Keyed so a different rule starts from its own values.
  return (
    <RecurringForm
      key={rule?.id ?? 'new'}
      {...(rule && { rule })}
      accounts={accounts.data ?? []}
      categories={categories.data ?? []}
    />
  );
}
