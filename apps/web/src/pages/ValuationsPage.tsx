import { hasRole, money } from '@daric/core';
import type { Account, AccountValuation } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useId } from 'react';
import { Link, useParams } from 'react-router';
import { currencyOf, useAccounts } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useDeleteValuation, useValuations } from '../net-worth/net-worth';
import { ValuationForm } from '../net-worth/ValuationForm';
import { useFormatters } from '../settings/settings';

function ValuationList({
  account,
  valuations,
  canManage,
}: {
  account: Account;
  /** Newest first. */
  valuations: AccountValuation[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const remove = useDeleteValuation(account.id);
  const listId = useId();

  return (
    <div className="flex flex-col gap-2">
      <h2 id={listId} className="text-lg font-bold">
        {t('valuations.list')}
      </h2>
      {valuations.length === 0 ? (
        <p className="text-foreground-muted">{t('valuations.empty')}</p>
      ) : (
        <ul
          aria-labelledby={listId}
          className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface"
        >
          {valuations.map((valuation) => {
            const day = isolate(format.day(valuation.valuedOn));
            return (
              <li
                key={valuation.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
              >
                <div className="me-auto flex flex-col">
                  <span className="font-medium tabular-nums">
                    {format.money(money(valuation.amount, currencyOf(account)))}
                  </span>
                  <span className="text-sm text-foreground-muted">
                    {t('valuations.from', { day })}
                  </span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(valuation.id)}
                    aria-label={t('valuations.delete', { day })}
                    className="rounded-md border border-border px-3 py-1 text-sm font-medium text-danger disabled:opacity-60"
                  >
                    {t('valuations.deleteButton')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** `/accounts/:accountId/valuations`: every Member sees them, Owners and Admins change them. */
export function ValuationsPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const { accountId = '' } = useParams();
  const accounts = useAccounts({ includeArchived: true });
  const valuations = useValuations(accountId);
  const canManage = hasRole(workspace.role, 'ADMIN');
  const account = accounts.data?.find((a) => a.id === accountId);
  const back = (
    <Link to="/net-worth" className="text-sm font-medium text-accent underline underline-offset-4">
      {t('valuations.back')}
    </Link>
  );

  if (accounts.isPending) {
    return (
      <p role="status" className="text-center text-foreground-muted">
        {t('session.loading')}
      </p>
    );
  }
  if (!account) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p role="alert">{accounts.isError ? t('accounts.loadFailed') : t('accounts.notFound')}</p>
        {back}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-2xl font-bold">
          {t('valuations.title', { name: account.name })}
        </h1>
        {back}
      </div>
      <p className="text-sm text-foreground-muted">{t('valuations.intro')}</p>
      {!canManage ? (
        <p className="text-sm text-foreground-muted">{t('valuations.readOnly')}</p>
      ) : account.archived ? (
        <p className="text-sm text-foreground-muted">{t('valuations.archived')}</p>
      ) : (
        <ValuationForm account={account} />
      )}
      {valuations.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : valuations.isError ? (
        <p role="alert" className="text-danger">
          {t('valuations.loadFailed')}
        </p>
      ) : (
        <ValuationList account={account} valuations={valuations.data} canManage={canManage} />
      )}
    </div>
  );
}
