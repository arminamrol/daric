import { hasRole } from '@daric/core';
import { Link } from 'react-router';
import { useAccounts } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';
import { useLabels } from '../labels/labels';
import { TransactionForm } from './TransactionForm';

/**
 * Where a Transaction is recorded, on the Transactions page and in the shell's sheet: the entry
 * form once the Workspace has an active Account, otherwise why it cannot be used yet.
 */
export function RecordTransaction({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const accounts = useAccounts({ includeArchived: true });
  const categories = useCategories();
  const labels = useLabels();
  const activeAccounts = accounts.data?.filter((a) => !a.archived) ?? [];

  if (!hasRole(workspace.role, 'MEMBER')) {
    return <p className="text-sm text-foreground-muted">{t('transactions.readOnly')}</p>;
  }
  if (accounts.isPending || categories.isPending || labels.isPending) {
    return (
      <p role="status" className="text-foreground-muted">
        {t('session.loading')}
      </p>
    );
  }
  if (accounts.isError || categories.isError || labels.isError) {
    return (
      <p role="alert" className="text-danger">
        {t('transactions.list.loadFailed')}
      </p>
    );
  }
  if (activeAccounts.length === 0) {
    return hasRole(workspace.role, 'ADMIN') ? (
      <div className="flex flex-wrap items-center gap-3">
        <p>{t('transactions.noAccount')}</p>
        <Link
          to="/accounts/new"
          onClick={onNavigate}
          className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary"
        >
          {t('accounts.new')}
        </Link>
      </div>
    ) : (
      <p>{t('transactions.noAccountAskAdmin')}</p>
    );
  }
  return (
    <TransactionForm accounts={activeAccounts} categories={categories.data} labels={labels.data} />
  );
}
