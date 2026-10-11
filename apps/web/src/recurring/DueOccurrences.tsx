import { IRR, money, parseAmount } from '@daric/core';
import type { Account, DueOccurrence, ParseAmountError } from '@daric/core';
import { isolate } from '@daric/i18n';
import type { PlainMessageKey } from '@daric/i18n';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { currencyOf } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { useConfirmOccurrence, useDueOccurrences, useSkipOccurrence } from './recurring';

const AMOUNT_ERRORS: Record<ParseAmountError, PlainMessageKey> = {
  empty: 'transactions.error.amountRequired',
  invalid: 'accounts.error.amountInvalid',
  too_many_decimals: 'accounts.error.amountTooPrecise',
  out_of_range: 'accounts.error.amountTooLarge',
};

/** What the last confirm or skip did, said once in a live region. */
type Outcome = { key: 'due.confirmed' | 'due.skipped'; name: string } | { key: 'due.failed' };

/**
 * The Due Occurrences, oldest first, each waiting for a one-tap confirmation
 * with an Amount that can be changed first, or to be skipped. A Viewer only
 * sees them.
 */
export function DueOccurrences({
  accounts,
  canConfirm,
}: {
  /** Archived ones included, to name and price every occurrence. */
  accounts: readonly Account[];
  canConfirm: boolean;
}) {
  const { t } = useI18n();
  const due = useDueOccurrences();
  const headingId = useId();
  const [outcome, setOutcome] = useState<Outcome>();

  return (
    <section className="flex flex-col gap-3">
      <h2 id={headingId} className="text-xl font-bold">
        {t('due.title')}
      </h2>
      <p role="status" className="text-sm empty:hidden">
        {outcome &&
          (outcome.key === 'due.failed'
            ? t('due.failed')
            : t(outcome.key, { name: isolate(outcome.name) }))}
      </p>
      {due.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : due.isError ? (
        <p role="alert" className="text-danger">
          {t('recurring.loadFailed')}
        </p>
      ) : due.data.occurrences.length === 0 ? (
        <p className="text-foreground-muted">{t('due.empty')}</p>
      ) : (
        <ul
          aria-labelledby={headingId}
          className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface px-4"
        >
          {due.data.occurrences.map((occurrence) => (
            <DueItem
              key={`${occurrence.ruleId}|${occurrence.dueOn}`}
              occurrence={occurrence}
              account={accounts.find((a) => a.id === occurrence.accountId)}
              canConfirm={canConfirm}
              onDone={setOutcome}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function DueItem({
  occurrence,
  account,
  canConfirm,
  onDone,
}: {
  occurrence: DueOccurrence;
  account: Account | undefined;
  canConfirm: boolean;
  onDone: (outcome: Outcome) => void;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const id = useId();
  const ids = { amount: `${id}-amount`, error: `${id}-error` };
  const amountRef = useRef<HTMLInputElement>(null);
  const currency = account ? currencyOf(account) : IRR;
  const shown = (amount: bigint, label = true) =>
    format.money(money(amount, currency), { label, grouping: label });
  const [amount, setAmount] = useState(() => shown(occurrence.amount, false));
  const [error, setError] = useState<PlainMessageKey>();
  const confirm = useConfirmOccurrence();
  const skip = useSkipOccurrence();
  const busy = confirm.isPending || skip.isPending;
  const action = { ruleId: occurrence.ruleId, dueOn: occurrence.dueOn };
  const done = { name: occurrence.name };
  const failed = () => onDone({ key: 'due.failed' });

  function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(amount, currency, { display: workspace.moneyDisplay });
    const found = !parsed.ok
      ? AMOUNT_ERRORS[parsed.error]
      : parsed.money.amount <= 0n
        ? 'transactions.error.amountPositive'
        : undefined;
    setError(found);
    if (found || !parsed.ok) return amountRef.current?.focus();
    confirm.mutate(
      { ...action, amount: parsed.money.amount },
      { onSuccess: () => onDone({ key: 'due.confirmed', ...done }), onError: failed },
    );
  }

  const day = format.day(occurrence.dueOn);
  return (
    <li
      aria-label={t('due.item', { name: isolate(occurrence.name), date: isolate(day) })}
      className="flex flex-col gap-2 py-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="me-auto font-medium">{occurrence.name}</span>
        <span className="text-sm text-foreground-muted">{day}</span>
        {account && <span className="text-sm text-foreground-muted">{account.name}</span>}
        {!canConfirm && <span className="font-medium">{shown(occurrence.amount)}</span>}
      </div>
      {canConfirm && (
        <form noValidate onSubmit={onConfirm} className="flex flex-wrap items-start gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.amount} className="sr-only">
              {t('transactions.form.amount')}
            </label>
            <input
              ref={amountRef}
              id={ids.amount}
              value={amount}
              inputMode="decimal"
              autoComplete="off"
              onChange={(e) => {
                setError(undefined);
                setAmount(e.target.value);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.error : undefined}
              className="w-40 rounded-md border border-border bg-background px-3 py-1.5 text-foreground aria-invalid:border-danger"
            />
            {error && (
              <p id={ids.error} className="text-sm text-danger">
                {t(error)}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-4 py-1.5 font-medium text-on-primary disabled:opacity-60"
          >
            {t('due.confirm')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              skip.mutate(action, {
                onSuccess: () => onDone({ key: 'due.skipped', ...done }),
                onError: failed,
              })
            }
            className="rounded-md border border-border px-4 py-1.5 font-medium disabled:opacity-60"
          >
            {t('due.skip')}
          </button>
        </form>
      )}
    </li>
  );
}
