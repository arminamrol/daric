import {
  accountClasses,
  accountTypes,
  currencyCodes,
  defaultAccountClass,
  IRR,
  money,
  parseAmount,
} from '@daric/core';
import type {
  Account,
  AccountClass,
  AccountType,
  MoneyDisplay,
  ParseAmountError,
} from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { CURRENCY_NAMES } from '../settings/labels';
import { useFormatters } from '../settings/settings';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import { currencyOf, useCreateAccount, useUpdateAccount } from './accounts';
import { ACCOUNT_CLASS_LABELS, ACCOUNT_TYPE_LABELS } from './labels';

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger disabled:cursor-not-allowed';

const AMOUNT_ERRORS: Record<Exclude<ParseAmountError, 'empty'>, PlainMessageKey> = {
  invalid: 'accounts.error.amountInvalid',
  too_many_decimals: 'accounts.error.amountTooPrecise',
  out_of_range: 'accounts.error.amountTooLarge',
};

/** What IRR is typed in. */
const MONEY_DISPLAY_UNITS: Record<MoneyDisplay, PlainMessageKey> = {
  rial: 'settings.workspace.moneyDisplay.rial',
  toman: 'settings.workspace.moneyDisplay.toman',
};

interface Draft {
  name: string;
  type: AccountType;
  class: AccountClass;
  currency: string;
  openingBalance: string;
}

interface FieldErrors {
  name?: PlainMessageKey;
  openingBalance?: PlainMessageKey;
}

/**
 * Creates an Account, or edits and archives `account`. The opening balance is
 * typed as shown: in tomans when the Workspace shows IRR in tomans.
 */
export function AccountForm({ account }: { account?: Account }) {
  const { t } = useI18n();
  const format = useFormatters();
  const navigate = useNavigate();
  const { workspace } = useSignedIn();
  const id = useId();
  const ids = {
    title: `${id}-title`,
    name: `${id}-name`,
    nameError: `${id}-name-error`,
    type: `${id}-type`,
    classHint: `${id}-class-hint`,
    currency: `${id}-currency`,
    currencyHint: `${id}-currency-hint`,
    balance: `${id}-balance`,
    balanceHint: `${id}-balance-hint`,
    balanceError: `${id}-balance-error`,
    archiveHint: `${id}-archive-hint`,
  };
  const nameRef = useRef<HTMLInputElement>(null);
  const balanceRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(() =>
    account
      ? {
          name: account.name,
          type: account.type,
          class: account.class,
          currency: account.currency,
          openingBalance: format.money(money(account.openingBalance, currencyOf(account)), {
            label: false,
            grouping: false,
          }),
        }
      : {
          name: '',
          type: 'BANK',
          class: defaultAccountClass('BANK'),
          currency: currencyCodes.includes(workspace.baseCurrency) ? workspace.baseCurrency : 'IRR',
          openingBalance: '',
        },
  );
  // Until the user picks a class, it follows the type (a loan is a Liability).
  const [classPicked, setClassPicked] = useState(Boolean(account));
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = useCreateAccount();
  const update = useUpdateAccount(account?.id ?? '');
  const save = account ? update : create;

  const currency = currencyOf(draft);
  const unitName =
    currency.code === IRR.code
      ? MONEY_DISPLAY_UNITS[workspace.moneyDisplay]
      : CURRENCY_NAMES[currency.code];
  const unit = unitName ? t(unitName) : currency.code;

  function change(next: Partial<Draft>) {
    save.reset();
    setDraft((current) => ({ ...current, ...next }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim();
    const parsed = parseAmount(draft.openingBalance, currency, {
      display: workspace.moneyDisplay,
    });
    // Nothing typed means the Account starts at zero.
    const openingBalance = parsed.ok ? parsed.money.amount : parsed.error === 'empty' ? 0n : null;
    const found: FieldErrors = {};
    if (name === '') found.name = 'accounts.error.nameRequired';
    if (!parsed.ok && parsed.error !== 'empty') found.openingBalance = AMOUNT_ERRORS[parsed.error];
    setErrors(found);
    if (found.name) return nameRef.current?.focus();
    if (openingBalance === null) return balanceRef.current?.focus();

    const fields = { name, type: draft.type, class: draft.class, openingBalance };
    if (account) {
      // Only real changes, so the audit log names them.
      const changes = Object.fromEntries(
        Object.entries(fields).filter(
          ([key, value]) => account[key as keyof typeof fields] !== value,
        ),
      );
      if (Object.keys(changes).length === 0) return done();
      update.mutate(changes, { onSuccess: done });
    } else create.mutate({ ...fields, currency: currency.code }, { onSuccess: done });
  }

  function done() {
    void navigate('/accounts');
  }

  const title = account ? 'accounts.form.editTitle' : 'accounts.form.newTitle';
  const describedBy = (...list: (string | false | undefined)[]) =>
    list.filter(Boolean).join(' ') || undefined;

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6">
      <h1 id={ids.title} className="text-2xl font-bold">
        {t(title)}
      </h1>
      <form
        aria-labelledby={ids.title}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.name} className="font-medium">
            {t('accounts.form.name')}
          </label>
          <input
            ref={nameRef}
            id={ids.name}
            value={draft.name}
            maxLength={100}
            onChange={(e) => change({ name: e.target.value })}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy(errors.name && ids.nameError)}
            className={inputClass}
          />
          {errors.name && (
            <p id={ids.nameError} className="text-sm text-danger">
              {t(errors.name)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.type} className="font-medium">
            {t('accounts.form.type')}
          </label>
          <select
            id={ids.type}
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as AccountType;
              change(classPicked ? { type } : { type, class: defaultAccountClass(type) });
            }}
            className={inputClass}
          >
            {accountTypes.map((type) => (
              <option key={type} value={type}>
                {t(ACCOUNT_TYPE_LABELS[type])}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <ChoiceGroup<AccountClass>
            legend={t('accounts.form.class')}
            choices={accountClasses.map((value) => ({
              value,
              label: t(ACCOUNT_CLASS_LABELS[value]),
            }))}
            value={draft.class}
            onChange={(value) => {
              setClassPicked(true);
              change({ class: value });
            }}
            describedBy={ids.classHint}
          />
          <p id={ids.classHint} className="text-sm text-foreground-muted">
            {t('accounts.form.classHint')}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.currency} className="font-medium">
            {t('accounts.form.currency')}
          </label>
          <select
            id={ids.currency}
            value={draft.currency}
            disabled={Boolean(account)}
            onChange={(e) => change({ currency: e.target.value })}
            aria-describedby={account ? ids.currencyHint : undefined}
            className={inputClass}
          >
            {currencyCodes.map((code) => {
              const name = CURRENCY_NAMES[code];
              return (
                <option key={code} value={code}>
                  {name ? t(name) : code}
                </option>
              );
            })}
          </select>
          {account && (
            <p id={ids.currencyHint} className="text-sm text-foreground-muted">
              {t('accounts.form.currencyFixed')}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.balance} className="font-medium">
            {t('accounts.form.openingBalance')}
          </label>
          <input
            ref={balanceRef}
            id={ids.balance}
            value={draft.openingBalance}
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            onChange={(e) => change({ openingBalance: e.target.value })}
            aria-invalid={errors.openingBalance ? true : undefined}
            aria-describedby={describedBy(
              ids.balanceHint,
              errors.openingBalance && ids.balanceError,
            )}
            className={inputClass}
          />
          <p id={ids.balanceHint} className="text-sm text-foreground-muted">
            {t('accounts.form.openingBalanceHint', { unit })}
          </p>
          {errors.openingBalance && (
            <p id={ids.balanceError} className="text-sm text-danger">
              {t(errors.openingBalance)}
            </p>
          )}
        </div>
        {save.isError && (
          <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
            {t('settings.saveFailed')}
          </p>
        )}
        <button
          type="submit"
          disabled={save.isPending}
          className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60"
        >
          {t(account ? 'accounts.form.save' : 'accounts.form.create')}
        </button>
      </form>
      {account && (
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => update.mutate({ archived: !account.archived }, { onSuccess: done })}
            aria-describedby={ids.archiveHint}
            className="w-fit rounded-md border border-border px-4 py-2 font-medium disabled:opacity-60"
          >
            {t(account.archived ? 'accounts.form.unarchive' : 'accounts.form.archive')}
          </button>
          <p id={ids.archiveHint} className="text-sm text-foreground-muted">
            {t('accounts.form.archiveHint')}
          </p>
        </div>
      )}
    </section>
  );
}
