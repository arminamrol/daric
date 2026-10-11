import { hasRole, money } from '@daric/core';
import type { RecurringRule } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useId } from 'react';
import { Link, useSearchParams } from 'react-router';
import { currencyOf, useAccounts } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';
import { DueOccurrences } from '../recurring/DueOccurrences';
import { EVERY_LABELS, EVERY_N_LABELS } from '../recurring/labels';
import { useRecurringRules } from '../recurring/recurring';
import { useFormatters } from '../settings/settings';

/**
 * `/recurring` (`?archived=1` shows archived rules too): the Due Occurrences
 * waiting for confirmation, then every Recurring Rule with its schedule and
 * next occurrence. Members confirm and skip; Owners and Admins change rules.
 */
export function RecurringPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const [params, setParams] = useSearchParams();
  const includeArchived = params.get('archived') === '1';
  const rules = useRecurringRules();
  const accounts = useAccounts({ includeArchived: true });
  const categories = useCategories();
  const canManage = hasRole(workspace.role, 'ADMIN');
  const toggleId = useId();
  const listLabelId = useId();

  function setArchived(show: boolean) {
    const next = new URLSearchParams(params);
    if (show) next.set('archived', '1');
    else next.delete('archived');
    setParams(next, { replace: true });
  }

  const visible = (rules.data ?? []).filter((r) => includeArchived || !r.archived);
  const loading = rules.isPending || accounts.isPending || categories.isPending;
  const failed = rules.isError || accounts.isError || categories.isError;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-2xl font-bold">{t('recurring.title')}</h1>
        {canManage && (
          <Link
            to="/recurring/new"
            className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary"
          >
            {t('recurring.new')}
          </Link>
        )}
      </div>
      {!canManage && <p className="text-sm text-foreground-muted">{t('recurring.readOnly')}</p>}
      <DueOccurrences
        accounts={accounts.data ?? []}
        canConfirm={hasRole(workspace.role, 'MEMBER')}
      />
      <section className="flex flex-col gap-3">
        <h2 id={listLabelId} className="text-xl font-bold">
          {t('recurring.all')}
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <input
            id={toggleId}
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          <label htmlFor={toggleId}>{t('recurring.showArchived')}</label>
        </div>
        {loading ? (
          <p role="status" className="text-foreground-muted">
            {t('session.loading')}
          </p>
        ) : failed ? (
          <p role="alert" className="text-danger">
            {t('recurring.loadFailed')}
          </p>
        ) : visible.length === 0 ? (
          <p className="text-foreground-muted">{t('recurring.empty')}</p>
        ) : (
          <ul
            aria-labelledby={listLabelId}
            className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface px-4"
          >
            {visible.map((rule) => (
              <RuleItem
                key={rule.id}
                rule={rule}
                accountName={accounts.data.find((a) => a.id === rule.accountId)?.name}
                currency={currencyOf(
                  accounts.data.find((a) => a.id === rule.accountId) ?? { currency: 'IRR' },
                )}
                categoryName={categories.data.find((c) => c.id === rule.categoryId)?.name}
                canManage={canManage}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RuleItem({
  rule,
  accountName,
  currency,
  categoryName,
  canManage,
}: {
  rule: RecurringRule;
  accountName: string | undefined;
  currency: ReturnType<typeof currencyOf>;
  categoryName: string | undefined;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const nameId = useId();
  const schedule =
    rule.interval === 1
      ? t(EVERY_LABELS[rule.frequency])
      : t(EVERY_N_LABELS[rule.frequency], { count: format.count(rule.interval) });
  const name = <span id={nameId}>{rule.name}</span>;

  return (
    <li aria-labelledby={nameId} className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {canManage ? (
          <Link
            to={`/recurring/${rule.id}`}
            aria-label={t('recurring.edit', { name: isolate(rule.name) })}
            className="me-auto font-medium underline-offset-4 hover:underline"
          >
            {name}
          </Link>
        ) : (
          <span className="me-auto font-medium">{name}</span>
        )}
        <span className="font-medium">
          {t(`transactions.type.${rule.type}`)} · {format.money(money(rule.amount, currency))}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-foreground-muted">
        <span>{schedule}</span>
        <span>
          {rule.nextDueOn
            ? t('recurring.next', { date: isolate(format.day(rule.nextDueOn)) })
            : t('recurring.ended')}
        </span>
        {accountName && <span>{accountName}</span>}
        {categoryName && <span>{categoryName}</span>}
        {rule.autoPost && (
          <span className="rounded-full bg-surface-muted px-2 text-foreground">
            {t('recurring.autoPost')}
          </span>
        )}
        {rule.archived && <span>{t('recurring.archived')}</span>}
      </div>
    </li>
  );
}
