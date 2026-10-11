import { mayChangeTransaction } from '@daric/core';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useAccounts } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';
import { useLabels } from '../labels/labels';
import { TransactionForm } from '../transactions/TransactionForm';
import { useTransaction } from '../transactions/transactions';

/**
 * `/transactions/:transactionId`: edits one Transaction. A Member reaches only
 * the ones they recorded, a Viewer none.
 */
export function TransactionEditPage() {
  const { t } = useI18n();
  const { me, workspace } = useSignedIn();
  const navigate = useNavigate();
  const { transactionId = '' } = useParams();
  const transaction = useTransaction(transactionId);
  const accounts = useAccounts({ includeArchived: true });
  const categories = useCategories();
  const labels = useLabels();

  if (transaction.isPending || accounts.isPending || categories.isPending || labels.isPending) {
    return (
      <p role="status" className="text-center text-foreground-muted">
        {t('session.loading')}
      </p>
    );
  }
  if (transaction.isError || accounts.isError || categories.isError || labels.isError) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p role="alert">
          {transaction.isError
            ? t('transactions.edit.notFound')
            : t('transactions.list.loadFailed')}
        </p>
        <Link to="/transactions" className="font-medium text-accent underline underline-offset-4">
          {t('transactions.edit.back')}
        </Link>
      </div>
    );
  }
  if (!mayChangeTransaction(workspace.role, me.user.id, transaction.data)) {
    return <Navigate to="/transactions" replace />;
  }
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <TransactionForm
        // Keyed so another Transaction starts from its own values.
        key={transaction.data.id}
        transaction={transaction.data}
        accounts={accounts.data}
        categories={categories.data}
        labels={labels.data}
        onSaved={() => navigate('/transactions')}
      />
      <Link to="/transactions" className="font-medium text-accent underline underline-offset-4">
        {t('transactions.edit.back')}
      </Link>
    </div>
  );
}
