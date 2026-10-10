import { accountClasses, hasRole } from '@daric/core';
import type { Account, AccountClass } from '@daric/core';
import { useId } from 'react';
import { Link, useSearchParams } from 'react-router';
import { balanceOf, useAccounts } from '../accounts/accounts';
import { ACCOUNT_GROUP_LABELS, ACCOUNT_TYPE_LABELS } from '../accounts/labels';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';

function AccountGroup({
  accountClass,
  accounts,
  canManage,
}: {
  accountClass: AccountClass;
  accounts: Account[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-lg font-bold">
        {t(ACCOUNT_GROUP_LABELS[accountClass])}
      </h2>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {accounts.map((account) => (
          <li key={account.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <div className="me-auto flex flex-col">
              {canManage ? (
                <Link
                  to={`/accounts/${account.id}`}
                  aria-label={t('accounts.edit', { name: account.name })}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {account.name}
                </Link>
              ) : (
                <span className="font-medium">{account.name}</span>
              )}
              <span className="text-sm text-foreground-muted">
                {t(ACCOUNT_TYPE_LABELS[account.type])}
                {account.archived && (
                  <>
                    {' · '}
                    <span>{t('accounts.archived')}</span>
                  </>
                )}
              </span>
            </div>
            <span className="font-medium tabular-nums">{format.money(balanceOf(account))}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AccountsPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const [params, setParams] = useSearchParams();
  const includeArchived = params.get('archived') === '1';
  const accounts = useAccounts({ includeArchived });
  const canManage = hasRole(workspace.role, 'ADMIN');
  const toggleId = useId();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-2xl font-bold">{t('accounts.title')}</h1>
        {canManage && (
          <Link
            to="/accounts/new"
            className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary"
          >
            {t('accounts.new')}
          </Link>
        )}
      </div>
      {!canManage && <p className="text-sm text-foreground-muted">{t('accounts.readOnly')}</p>}
      <div className="flex items-center gap-2 text-sm">
        <input
          id={toggleId}
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setParams(e.target.checked ? { archived: '1' } : {}, { replace: true })}
        />
        <label htmlFor={toggleId}>{t('accounts.showArchived')}</label>
      </div>
      {accounts.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : accounts.isError ? (
        <p role="alert" className="text-danger">
          {t('accounts.loadFailed')}
        </p>
      ) : accounts.data.length === 0 ? (
        <p className="text-foreground-muted">{t('accounts.empty')}</p>
      ) : (
        accountClasses.map((accountClass) => {
          const inClass = accounts.data.filter((a) => a.class === accountClass);
          return inClass.length === 0 ? null : (
            <AccountGroup
              key={accountClass}
              accountClass={accountClass}
              accounts={inClass}
              canManage={canManage}
            />
          );
        })
      )}
    </div>
  );
}
