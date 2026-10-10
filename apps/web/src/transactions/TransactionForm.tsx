import { IRR, parseAmount, parseDisplayDay, transactionTypes } from '@daric/core';
import type { Account, Category, ParseAmountError, TransactionType } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { currencyOf } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { CALENDAR_LABELS, CURRENCY_NAMES } from '../settings/labels';
import { useFormatters } from '../settings/settings';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import { categoryChoices } from './choices';
import { readLastEntry, useRecordTransaction, writeLastEntry } from './transactions';

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger';

const AMOUNT_ERRORS: Record<ParseAmountError, PlainMessageKey> = {
  empty: 'transactions.error.amountRequired',
  invalid: 'accounts.error.amountInvalid',
  too_many_decimals: 'accounts.error.amountTooPrecise',
  out_of_range: 'accounts.error.amountTooLarge',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, PlainMessageKey> = {
  EXPENSE: 'transactions.type.EXPENSE',
  INCOME: 'transactions.type.INCOME',
};

/** Expense first: it is what people record most. */
const TYPE_ORDER: readonly TransactionType[] = ['EXPENSE', 'INCOME'];

interface FieldErrors {
  amount?: PlainMessageKey;
  day?: PlainMessageKey;
  category?: PlainMessageKey;
}

/**
 * Fast entry of an Income or Expense: the amount comes first and Enter records
 * it. The Account and Categories last used on this device are kept, and after
 * each entry the amount is cleared and focused for the next one.
 */
export function TransactionForm({
  accounts,
  categories,
}: {
  /** Active Accounts only; at least one. */
  accounts: readonly Account[];
  categories: readonly Category[];
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const { me, workspace } = useSignedIn();
  const { displayCalendar } = me.preferences;
  const id = useId();
  const ids = {
    title: `${id}-title`,
    amount: `${id}-amount`,
    amountHint: `${id}-amount-hint`,
    amountError: `${id}-amount-error`,
    account: `${id}-account`,
    category: `${id}-category`,
    categoryError: `${id}-category-error`,
    day: `${id}-day`,
    dayHint: `${id}-day-hint`,
    dayError: `${id}-day-error`,
    note: `${id}-note`,
  };
  const amountRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);

  const choices = useMemo(() => {
    const active = categories.filter((c) => !c.archived);
    return Object.fromEntries(
      transactionTypes.map((type) => [
        type,
        categoryChoices(
          active.filter((c) => c.kind === type),
          t,
        ),
      ]),
    ) as Record<TransactionType, ReturnType<typeof categoryChoices>>;
  }, [categories, t]);

  const [last] = useState(() => readLastEntry(workspace.id));
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(() =>
    accounts.some((a) => a.id === last.accountId) ? last.accountId : accounts[0]?.id,
  );
  const [pickedCategories, setPickedCategories] = useState(last.categoryIds ?? {});
  const [day, setDay] = useState(() => format.day(format.today(new Date())));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  // One id per draft: sending the same draft again (a retry) cannot record it twice.
  const draftId = useRef<string | null>(null);
  const record = useRecordTransaction();

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const picked = pickedCategories[type];
  const categoryId = choices[type].some((c) => c.id === picked) ? picked : choices[type][0]?.id;
  const currency = account ? currencyOf(account) : IRR;
  const unitName =
    currency.code === IRR.code
      ? workspace.moneyDisplay === 'toman'
        ? 'settings.workspace.moneyDisplay.toman'
        : 'settings.workspace.moneyDisplay.rial'
      : CURRENCY_NAMES[currency.code];

  function changed() {
    draftId.current = null;
    setSaved(false);
    record.reset();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(amount, currency, { display: workspace.moneyDisplay });
    const occurredOn = parseDisplayDay(day, displayCalendar);
    const found: FieldErrors = {};
    if (!parsed.ok) found.amount = AMOUNT_ERRORS[parsed.error];
    else if (parsed.money.amount <= 0n) found.amount = 'transactions.error.amountPositive';
    if (!categoryId) found.category = 'transactions.error.category';
    if (!occurredOn) found.day = 'transactions.error.day';
    setErrors(found);
    if (found.amount) return amountRef.current?.focus();
    if (found.category) return categoryRef.current?.focus();
    if (found.day) return dayRef.current?.focus();
    if (!parsed.ok || !account || !categoryId || !occurredOn) return;

    draftId.current ??= uuidv7();
    record.mutate(
      {
        id: draftId.current,
        type,
        accountId: account.id,
        categoryId,
        amount: parsed.money.amount,
        occurredOn,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          writeLastEntry(workspace.id, {
            accountId: account.id,
            categoryIds: { ...pickedCategories, [type]: categoryId },
          });
          draftId.current = null;
          setAmount('');
          setNote('');
          setSaved(true);
          amountRef.current?.focus();
        },
      },
    );
  }

  const describedBy = (...list: (string | false | undefined)[]) =>
    list.filter(Boolean).join(' ') || undefined;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6">
      <h2 id={ids.title} className="text-lg font-bold">
        {t('transactions.form.title')}
      </h2>
      <form
        aria-labelledby={ids.title}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        <ChoiceGroup<TransactionType>
          legend={t('transactions.form.type')}
          hideLegend
          choices={TYPE_ORDER.map((value) => ({ value, label: t(TRANSACTION_TYPE_LABELS[value]) }))}
          value={type}
          onChange={(value) => {
            changed();
            setType(value);
          }}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.amount} className="font-medium">
            {t('transactions.form.amount')}
          </label>
          <input
            ref={amountRef}
            id={ids.amount}
            value={amount}
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            onChange={(e) => {
              changed();
              setAmount(e.target.value);
            }}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={describedBy(ids.amountHint, errors.amount && ids.amountError)}
            className={`${inputClass} text-lg tabular-nums`}
          />
          <p id={ids.amountHint} className="text-sm text-foreground-muted">
            {t('transactions.form.amountHint', { unit: unitName ? t(unitName) : currency.code })}
          </p>
          {errors.amount && (
            <p id={ids.amountError} className="text-sm text-danger">
              {t(errors.amount)}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.account} className="font-medium">
              {t('transactions.form.account')}
            </label>
            <select
              id={ids.account}
              value={account?.id}
              onChange={(e) => {
                changed();
                setAccountId(e.target.value);
              }}
              className={inputClass}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.category} className="font-medium">
              {t('transactions.form.category')}
            </label>
            {choices[type].length === 0 ? (
              <p className="py-2 text-sm text-foreground-muted">
                {t('transactions.form.noCategory')}
              </p>
            ) : (
              <select
                ref={categoryRef}
                id={ids.category}
                value={categoryId}
                onChange={(e) => {
                  changed();
                  setPickedCategories((current) => ({ ...current, [type]: e.target.value }));
                }}
                aria-invalid={errors.category ? true : undefined}
                aria-describedby={describedBy(errors.category && ids.categoryError)}
                className={inputClass}
              >
                {choices[type].map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            {errors.category && (
              <p id={ids.categoryError} className="text-sm text-danger">
                {t(errors.category)}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.day} className="font-medium">
              {t('transactions.form.day')}
            </label>
            <input
              ref={dayRef}
              id={ids.day}
              value={day}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => {
                changed();
                setDay(e.target.value);
              }}
              aria-invalid={errors.day ? true : undefined}
              aria-describedby={describedBy(ids.dayHint, errors.day && ids.dayError)}
              className={`${inputClass} tabular-nums`}
            />
            <p id={ids.dayHint} className="text-sm text-foreground-muted">
              {t('transactions.form.dayHint', { calendar: t(CALENDAR_LABELS[displayCalendar]) })}
            </p>
            {errors.day && (
              <p id={ids.dayError} className="text-sm text-danger">
                {t(errors.day)}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.note} className="font-medium">
              {t('transactions.form.note')}
            </label>
            <input
              id={ids.note}
              value={note}
              maxLength={1000}
              autoComplete="off"
              onChange={(e) => {
                changed();
                setNote(e.target.value);
              }}
              className={inputClass}
            />
          </div>
        </div>
        {record.isError && (
          <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
            {t('transactions.form.failed')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={record.isPending}
            className="rounded-md bg-primary px-6 py-2 font-medium text-on-primary disabled:opacity-60"
          >
            {t('transactions.form.submit')}
          </button>
          <p role="status" className="text-sm text-success">
            {saved ? t('transactions.form.saved') : ''}
          </p>
        </div>
      </form>
    </section>
  );
}
