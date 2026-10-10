import { hasRole } from '@daric/core';
import { Link, Navigate, useParams } from 'react-router';
import { AccountForm } from '../accounts/AccountForm';
import { useAccounts } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';

/** `/accounts/new` and `/accounts/:accountId`: Owner and Admin only. */
export function AccountFormPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const { accountId } = useParams();
  // Archived Accounts can be edited too (to unarchive them).
  const accounts = useAccounts({ includeArchived: true });

  if (!hasRole(workspace.role, 'ADMIN')) return <Navigate to="/accounts" replace />;
  if (!accountId) return <AccountForm />;
  if (accounts.isPending) {
    return (
      <p role="status" className="text-center text-foreground-muted">
        {t('session.loading')}
      </p>
    );
  }
  const account = accounts.data?.find((a) => a.id === accountId);
  if (!account) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p role="alert">{accounts.isError ? t('accounts.loadFailed') : t('accounts.notFound')}</p>
        <Link to="/accounts" className="font-medium text-accent underline underline-offset-4">
          {t('accounts.back')}
        </Link>
      </div>
    );
  }
  // Keyed so a different Account starts from its own values.
  return <AccountForm key={account.id} account={account} />;
}
