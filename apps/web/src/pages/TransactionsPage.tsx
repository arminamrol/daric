import { hasRole } from '@daric/core';
import { useId } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAccounts } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';
import { useLabels } from '../labels/labels';
import { useFormatters } from '../settings/settings';
import { categoryChoices } from '../transactions/choices';
import { TransactionForm } from '../transactions/TransactionForm';
import { TransactionList } from '../transactions/TransactionList';
import { useTransactions } from '../transactions/transactions';

const selectClass =
  'rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground';

/**
 * `/transactions`: fast entry on top, then one year of the Workspace Calendar
 * (`?year=`, the current one by default) grouped by month, optionally narrowed
 * to one Account (`?account=`), Category (`?category=`) or Label (`?label=`).
 */
export function TransactionsPage() {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const [params, setParams] = useSearchParams();
  const ids = { account: useId(), category: useId(), label: useId() };

  const yearParam = Number(params.get('year'));
  const year =
    Number.isInteger(yearParam) && yearParam > 0
      ? yearParam
      : format.currentPeriod(new Date()).year;
  const accountId = params.get('account') ?? undefined;
  const categoryId = params.get('category') ?? undefined;
  const labelId = params.get('label') ?? undefined;

  const accounts = useAccounts({ includeArchived: true });
  const categories = useCategories();
  const labels = useLabels();
  const transactions = useTransactions({
    period: { kind: 'year', year },
    ...(accountId && { accountId }),
    ...(categoryId && { categoryId }),
    ...(labelId && { labelId }),
  });
  const canRecord = hasRole(workspace.role, 'MEMBER');
  const activeAccounts = accounts.data?.filter((a) => !a.archived) ?? [];

  function setParam(name: string, value: string | undefined) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  }

  const yearLink = (to: number) => {
    const next = new URLSearchParams(params);
    next.set('year', String(to));
    return `?${next}`;
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('transactions.title')}</h1>
      {!canRecord ? (
        <p className="text-sm text-foreground-muted">{t('transactions.readOnly')}</p>
      ) : accounts.isPending || categories.isPending || labels.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : accounts.isError || categories.isError || labels.isError ? (
        <p role="alert" className="text-danger">
          {t('transactions.list.loadFailed')}
        </p>
      ) : activeAccounts.length === 0 ? (
        hasRole(workspace.role, 'ADMIN') ? (
          <div className="flex flex-wrap items-center gap-3">
            <p>{t('transactions.noAccount')}</p>
            <Link
              to="/accounts/new"
              className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary"
            >
              {t('accounts.new')}
            </Link>
          </div>
        ) : (
          <p>{t('transactions.noAccountAskAdmin')}</p>
        )
      ) : (
        <TransactionForm
          accounts={activeAccounts}
          categories={categories.data}
          labels={labels.data}
        />
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="me-auto text-xl font-bold">
            {t('transactions.list.year', { year: format.period({ kind: 'year', year }) })}
          </p>
          <nav className="flex gap-2 text-sm">
            <Link to={yearLink(year - 1)} className="rounded-md border border-border px-3 py-1">
              {t('transactions.list.previousYear')}
            </Link>
            <Link to={yearLink(year + 1)} className="rounded-md border border-border px-3 py-1">
              {t('transactions.list.nextYear')}
            </Link>
          </nav>
        </div>
        <div className="flex flex-wrap gap-3">
          <label htmlFor={ids.account} className="sr-only">
            {t('transactions.filter.account')}
          </label>
          <select
            id={ids.account}
            value={accountId ?? ''}
            onChange={(e) => setParam('account', e.target.value)}
            className={selectClass}
          >
            <option value="">{t('transactions.filter.allAccounts')}</option>
            {accounts.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <label htmlFor={ids.category} className="sr-only">
            {t('transactions.filter.category')}
          </label>
          <select
            id={ids.category}
            value={categoryId ?? ''}
            onChange={(e) => setParam('category', e.target.value)}
            className={selectClass}
          >
            <option value="">{t('transactions.filter.allCategories')}</option>
            {categoryChoices(categories.data ?? [], t).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {(labels.data?.length ?? 0) > 0 && (
            <>
              <label htmlFor={ids.label} className="sr-only">
                {t('transactions.filter.label')}
              </label>
              <select
                id={ids.label}
                value={labelId ?? ''}
                onChange={(e) => setParam('label', e.target.value)}
                className={selectClass}
              >
                <option value="">{t('transactions.filter.allLabels')}</option>
                {labels.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        {transactions.isPending ||
        accounts.isPending ||
        categories.isPending ||
        labels.isPending ? (
          <p role="status" className="text-foreground-muted">
            {t('session.loading')}
          </p>
        ) : transactions.isError ? (
          <p role="alert" className="text-danger">
            {t('transactions.list.loadFailed')}
          </p>
        ) : transactions.data.length === 0 ? (
          <p className="text-foreground-muted">{t('transactions.list.empty')}</p>
        ) : (
          <TransactionList
            transactions={transactions.data}
            accounts={accounts.data ?? []}
            categories={categories.data ?? []}
            labels={labels.data ?? []}
          />
        )}
      </div>
    </div>
  );
}
