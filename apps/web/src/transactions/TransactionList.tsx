import { groupByMonth, IRR, money } from '@daric/core';
import type { Account, Category, Label, MonthGroup, Transaction } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useId, useMemo } from 'react';
import { currencyOf } from '../accounts/accounts';
import { CategoryBadge } from '../categories/CategoryBadge';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { categoryChoices } from './choices';

function Month({
  group,
  accounts,
  categories,
  categoryLabels,
  labels,
}: {
  group: MonthGroup<Transaction>;
  accounts: ReadonlyMap<string, Account>;
  categories: ReadonlyMap<string, Category>;
  categoryLabels: ReadonlyMap<string, string>;
  labels: readonly Label[];
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id={titleId} className="me-auto text-lg font-bold">
          {format.period(group.period)}
        </h2>
        {group.totals.map(({ currency, income, expense }) => (
          <div key={currency.code} className="flex gap-3 text-sm tabular-nums">
            {income.amount > 0n && (
              <p className="text-success">
                {t('transactions.list.income', { amount: isolate(format.money(income)) })}
              </p>
            )}
            {expense.amount > 0n && (
              <p className="text-foreground-muted">
                {t('transactions.list.expense', { amount: isolate(format.money(expense)) })}
              </p>
            )}
          </div>
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {group.transactions.map((transaction) => {
          const account = accounts.get(transaction.accountId);
          const category = categories.get(transaction.categoryId);
          const amount = format.money(
            money(transaction.amount, account ? currencyOf(account) : IRR),
          );
          const income = transaction.type === 'INCOME';
          // In name order, as `labels` comes.
          const carried = labels.filter((l) => transaction.labelIds.includes(l.id));
          return (
            <li key={transaction.id} className="flex items-center gap-3 px-4 py-3">
              {category && <CategoryBadge icon={category.icon} color={category.color} size="sm" />}
              <div className="me-auto flex min-w-0 flex-col">
                <span className="font-medium">
                  {categoryLabels.get(transaction.categoryId) ?? category?.name}
                </span>
                <span className="text-sm text-foreground-muted">
                  {account && isolate(account.name)}
                  {' · '}
                  {format.day(transaction.occurredOn)}
                </span>
                {transaction.note && (
                  <span className="truncate text-sm text-foreground-muted">{transaction.note}</span>
                )}
                {carried.length > 0 && (
                  <ul
                    aria-label={t('transactions.list.labels')}
                    className="mt-1 flex flex-wrap gap-1"
                  >
                    {carried.map((label) => (
                      <li
                        key={label.id}
                        className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-foreground"
                      >
                        {label.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <span className={`shrink-0 font-medium tabular-nums ${income ? 'text-success' : ''}`}>
                {`${income ? '+' : '−'}${amount}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Transactions grouped by month of the Workspace Calendar, newest first, each
 * month with its Income and Expense totals per currency.
 */
export function TransactionList({
  transactions,
  accounts,
  categories,
  labels,
}: {
  transactions: readonly Transaction[];
  /** Archived ones included: old Transactions still name them. */
  accounts: readonly Account[];
  categories: readonly Category[];
  /** By name, archived ones included. */
  labels: readonly Label[];
}) {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const categoryLabels = useMemo(
    () => new Map(categoryChoices(categories, t).map((c) => [c.id, c.label])),
    [categories, t],
  );
  const groups = useMemo(
    () =>
      groupByMonth(transactions, workspace.calendar, (transaction) => {
        const account = accountsById.get(transaction.accountId);
        return account ? currencyOf(account) : IRR;
      }),
    [transactions, workspace.calendar, accountsById],
  );

  return groups.map((group) => (
    <Month
      key={`${group.period.year}-${group.period.month}`}
      group={group}
      accounts={accountsById}
      categories={categoriesById}
      categoryLabels={categoryLabels}
      labels={labels}
    />
  ));
}
