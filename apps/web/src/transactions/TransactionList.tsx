import { groupByMonth, IRR, money } from '@daric/core';
import type { Account, Category, Label, MonthGroup, Transaction } from '@daric/core';
import { isolate } from '@daric/i18n';
import type { PlainMessageKey } from '@daric/i18n';
import { ArrowLeftRight, CircleAlert, Clock, Pencil, Trash2 } from 'lucide-react';
import { useId, useMemo } from 'react';
import { Link } from 'react-router';
import { currencyOf } from '../accounts/accounts';
import { CategoryBadge } from '../categories/CategoryBadge';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { categoryChoices } from './choices';
import type { SyncState } from './pending';

const SYNC_LABELS = {
  pending: 'transactions.list.pending',
  conflict: 'transactions.list.conflict',
  rejected: 'transactions.list.rejected',
} as const satisfies Record<SyncState, PlainMessageKey>;

/** Marks a Transaction whose change has not reached the API yet. */
function SyncMark({ state }: { state: SyncState }) {
  const { t } = useI18n();
  const label = t(SYNC_LABELS[state]);
  const Icon = state === 'pending' ? Clock : CircleAlert;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`shrink-0 ${state === 'pending' ? 'text-foreground-muted' : 'text-danger'}`}
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
    </span>
  );
}

/** Editing and deleting from the list, for the Transactions the viewer may change. */
export interface ListActions {
  canChange: (transaction: Transaction) => boolean;
  onDelete: (transaction: Transaction) => void;
  /** While a delete is on its way. */
  busy: boolean;
}

const actionClass =
  'inline-flex size-8 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-60';

function Month({
  group,
  accounts,
  categories,
  categoryLabels,
  labels,
  states,
  actions,
}: {
  group: MonthGroup<Transaction>;
  accounts: ReadonlyMap<string, Account>;
  categories: ReadonlyMap<string, Category>;
  categoryLabels: ReadonlyMap<string, string>;
  labels: readonly Label[];
  states: ReadonlyMap<string, SyncState>;
  actions: ListActions | undefined;
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
          const amountIn = (amount: bigint, of: Account | undefined) =>
            format.money(money(amount, of ? currencyOf(of) : IRR));
          const amount = amountIn(transaction.amount, account);
          // In name order, as `labels` comes.
          const carried = labels.filter((l) => transaction.labelIds.includes(l.id));
          const state = states.get(transaction.id);
          let badge, title, where, shown, tone;
          if (transaction.type === 'TRANSFER') {
            const to = accounts.get(transaction.toAccountId);
            const toAmount = amountIn(transaction.toAmount, to);
            badge = (
              <span
                aria-hidden="true"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-foreground-muted"
              >
                <ArrowLeftRight className="size-4" strokeWidth={2} />
              </span>
            );
            title = t('transactions.type.TRANSFER');
            where = t('transactions.list.transferAccounts', {
              from: isolate(account?.name ?? ''),
              to: isolate(to?.name ?? ''),
            });
            // Neither Income nor Expense: no sign. Both Amounts when they are in different currencies.
            shown =
              !account || !to || account.currency === to.currency
                ? amount
                : t('transactions.list.transferAmounts', {
                    amount: isolate(amount),
                    toAmount: isolate(toAmount),
                  });
            tone = 'text-foreground-muted';
          } else {
            const category = categories.get(transaction.categoryId);
            const income = transaction.type === 'INCOME';
            badge = category && (
              <CategoryBadge icon={category.icon} color={category.color} size="sm" />
            );
            title = categoryLabels.get(transaction.categoryId) ?? category?.name;
            where = account && isolate(account.name);
            shown = `${income ? '+' : '−'}${amount}`;
            tone = income ? 'text-success' : '';
          }
          return (
            <li key={transaction.id} className="flex items-center gap-3 px-4 py-3">
              {badge}
              <div className="me-auto flex min-w-0 flex-col">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-foreground-muted">
                  {where}
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
              {state && <SyncMark state={state} />}
              <span className={`shrink-0 font-medium tabular-nums ${tone}`}>{shown}</span>
              {actions?.canChange(transaction) && (
                <div className="flex shrink-0 gap-1">
                  <Link
                    to={`/transactions/${transaction.id}`}
                    aria-label={t('transactions.list.edit')}
                    title={t('transactions.list.edit')}
                    className={actionClass}
                  >
                    <Pencil aria-hidden="true" className="size-4" strokeWidth={2} />
                  </Link>
                  <button
                    type="button"
                    aria-label={t('transactions.list.delete')}
                    title={t('transactions.list.delete')}
                    disabled={actions.busy}
                    onClick={() => actions.onDelete(transaction)}
                    className={actionClass}
                  >
                    <Trash2 aria-hidden="true" className="size-4" strokeWidth={2} />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Transactions grouped by month of the Workspace Calendar, newest first, each
 * month with its Income and Expense totals per currency. Transfers are listed
 * but left out of the totals.
 */
export function TransactionList({
  transactions,
  accounts,
  categories,
  labels,
  states = new Map(),
  actions,
}: {
  transactions: readonly Transaction[];
  /** Archived ones included: old Transactions still name them. */
  accounts: readonly Account[];
  categories: readonly Category[];
  /** By name, archived ones included. */
  labels: readonly Label[];
  /** Of those whose change has not reached the API yet. */
  states?: ReadonlyMap<string, SyncState>;
  /** Left out, the list only shows. */
  actions?: ListActions;
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
      states={states}
      actions={actions}
    />
  ));
}
