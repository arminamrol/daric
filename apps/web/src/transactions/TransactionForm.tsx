import { IRR, parseAmount, parseDisplayDay, transactionTypes } from '@daric/core';
import type {
  Account,
  AnyTransactionType,
  Category,
  CreateTransactionInput,
  Currency,
  Label,
  ParseAmountError,
  TransactionType,
} from '@daric/core';
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
import { readLastPicks, useRecordTransaction, writeLastPicks } from './transactions';

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger';

const AMOUNT_ERRORS: Record<ParseAmountError, PlainMessageKey> = {
  empty: 'transactions.error.amountRequired',
  invalid: 'accounts.error.amountInvalid',
  too_many_decimals: 'accounts.error.amountTooPrecise',
  out_of_range: 'accounts.error.amountTooLarge',
};

const TRANSACTION_TYPE_LABELS: Record<AnyTransactionType, PlainMessageKey> = {
  EXPENSE: 'transactions.type.EXPENSE',
  INCOME: 'transactions.type.INCOME',
  TRANSFER: 'transactions.type.TRANSFER',
};

/** Expense first: it is what people record most. */
const TYPE_ORDER: readonly AnyTransactionType[] = ['EXPENSE', 'INCOME', 'TRANSFER'];

interface FieldErrors {
  amount?: PlainMessageKey | undefined;
  toAmount?: PlainMessageKey | undefined;
  day?: PlainMessageKey;
  category?: PlainMessageKey;
}

/**
 * Fast entry of an Income, Expense or Transfer: the amount comes first and
 * Enter records it. The Accounts and Categories last used on this device are
 * kept, and after each one is recorded the amounts and Labels are cleared and
 * the amount focused for the next. A Transfer between currencies asks for the
 * Amount received too; nothing is converted.
 */
export function TransactionForm({
  accounts,
  categories,
  labels,
}: {
  /** Active Accounts only; at least one. */
  accounts: readonly Account[];
  categories: readonly Category[];
  /** Archived ones are left out of the picker. */
  labels: readonly Label[];
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
    toAccount: `${id}-to-account`,
    toAmount: `${id}-to-amount`,
    toAmountHint: `${id}-to-amount-hint`,
    toAmountError: `${id}-to-amount-error`,
    category: `${id}-category`,
    categoryError: `${id}-category-error`,
    day: `${id}-day`,
    dayHint: `${id}-day-hint`,
    dayError: `${id}-day-error`,
    note: `${id}-note`,
    labels: `${id}-labels`,
  };
  const amountRef = useRef<HTMLInputElement>(null);
  const toAmountRef = useRef<HTMLInputElement>(null);
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

  const [last] = useState(() => readLastPicks(workspace.id));
  const [type, setType] = useState<AnyTransactionType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [accountId, setAccountId] = useState(() =>
    accounts.some((a) => a.id === last.accountId) ? last.accountId : accounts[0]?.id,
  );
  const [toAccountId, setToAccountId] = useState(last.toAccountId);
  const [pickedCategories, setPickedCategories] = useState(last.categoryIds ?? {});
  const [day, setDay] = useState(() => format.day(format.today(new Date())));
  const [note, setNote] = useState('');
  const [labelIds, setLabelIds] = useState<readonly string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  // One id per draft: sending the same draft again (a retry) cannot record it twice.
  const draftId = useRef<string | null>(null);
  const record = useRecordTransaction();

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  const activeLabels = labels.filter((l) => !l.archived);
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const transfer = type === 'TRANSFER';
  const typeChoices = transfer ? [] : choices[type];
  const picked = transfer ? undefined : pickedCategories[type];
  const categoryId = typeChoices.some((c) => c.id === picked) ? picked : typeChoices[0]?.id;
  // A Transfer goes to another Account: never the one it leaves.
  const destinations = accounts.filter((a) => a.id !== account?.id);
  const toAccount = destinations.find((a) => a.id === toAccountId) ?? destinations[0];
  const currency = account ? currencyOf(account) : IRR;
  const toCurrency = toAccount ? currencyOf(toAccount) : currency;
  // Of one currency both Amounts are the same; between currencies the user gives both.
  const asksToAmount = transfer && toCurrency.code !== currency.code;

  const unitOf = (of: Currency) => {
    const name =
      of.code === IRR.code
        ? workspace.moneyDisplay === 'toman'
          ? 'settings.workspace.moneyDisplay.toman'
          : 'settings.workspace.moneyDisplay.rial'
        : CURRENCY_NAMES[of.code];
    return name ? t(name) : of.code;
  };

  function changed() {
    draftId.current = null;
    setSaved(false);
    // A save in flight must still finish: its success clears the form for the next one.
    if (!record.isPending) record.reset();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountError = (parsed: ReturnType<typeof parseAmount>) =>
      !parsed.ok
        ? AMOUNT_ERRORS[parsed.error]
        : parsed.money.amount <= 0n
          ? 'transactions.error.amountPositive'
          : undefined;
    const parsed = parseAmount(amount, currency, { display: workspace.moneyDisplay });
    const parsedTo = asksToAmount
      ? parseAmount(toAmount, toCurrency, { display: workspace.moneyDisplay })
      : undefined;
    const occurredOn = parseDisplayDay(day, displayCalendar);
    const found: FieldErrors = {};
    found.amount = amountError(parsed);
    if (parsedTo) {
      found.toAmount =
        !parsedTo.ok && parsedTo.error === 'empty'
          ? 'transactions.error.toAmountRequired'
          : amountError(parsedTo);
    }
    if (!transfer && !categoryId) found.category = 'transactions.error.category';
    if (!occurredOn) found.day = 'transactions.error.day';
    setErrors(found);
    if (found.amount) return amountRef.current?.focus();
    if (found.toAmount) return toAmountRef.current?.focus();
    if (found.category) return categoryRef.current?.focus();
    if (found.day) return dayRef.current?.focus();
    if (!parsed.ok || !account || !occurredOn) return;

    const common = {
      id: (draftId.current ??= uuidv7()),
      accountId: account.id,
      amount: parsed.money.amount,
      occurredOn,
      note: note.trim() || null,
      // A Label archived since it was ticked is left off.
      labelIds: labelIds.filter((labelId) => activeLabels.some((l) => l.id === labelId)),
    };
    let input: CreateTransactionInput;
    if (type === 'TRANSFER') {
      if (!toAccount) return;
      input = {
        ...common,
        type,
        toAccountId: toAccount.id,
        ...(parsedTo?.ok && { toAmount: parsedTo.money.amount }),
      };
    } else {
      if (!categoryId) return;
      input = { ...common, type, categoryId };
    }
    // The destination is kept for the next Transfer, also while recording others.
    const rememberedTo = transfer ? toAccount?.id : toAccountId;
    record.mutate(input, {
      onSuccess: () => {
        writeLastPicks(workspace.id, {
          accountId: account.id,
          ...(rememberedTo && { toAccountId: rememberedTo }),
          categoryIds: transfer ? pickedCategories : { ...pickedCategories, [type]: categoryId },
        });
        draftId.current = null;
        setAmount('');
        setToAmount('');
        setNote('');
        setLabelIds([]);
        setSaved(true);
        amountRef.current?.focus();
      },
    });
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
        <ChoiceGroup<AnyTransactionType>
          legend={t('transactions.form.type')}
          hideLegend
          choices={TYPE_ORDER.filter((value) => value !== 'TRANSFER' || accounts.length > 1).map(
            (value) => ({ value, label: t(TRANSACTION_TYPE_LABELS[value]) }),
          )}
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
            {t('transactions.form.amountHint', { unit: unitOf(currency) })}
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
              {t(transfer ? 'transactions.form.fromAccount' : 'transactions.form.account')}
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
          {transfer ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.toAccount} className="font-medium">
                {t('transactions.form.toAccount')}
              </label>
              <select
                id={ids.toAccount}
                value={toAccount?.id}
                onChange={(e) => {
                  changed();
                  setToAccountId(e.target.value);
                }}
                className={inputClass}
              >
                {destinations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.category} className="font-medium">
                {t('transactions.form.category')}
              </label>
              {typeChoices.length === 0 ? (
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
                    if (!transfer) {
                      setPickedCategories((current) => ({ ...current, [type]: e.target.value }));
                    }
                  }}
                  aria-invalid={errors.category ? true : undefined}
                  aria-describedby={describedBy(errors.category && ids.categoryError)}
                  className={inputClass}
                >
                  {typeChoices.map((c) => (
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
          )}
          {asksToAmount && (
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.toAmount} className="font-medium">
                {t('transactions.form.toAmount')}
              </label>
              <input
                ref={toAmountRef}
                id={ids.toAmount}
                value={toAmount}
                dir="ltr"
                inputMode="decimal"
                autoComplete="off"
                onChange={(e) => {
                  changed();
                  setToAmount(e.target.value);
                }}
                aria-invalid={errors.toAmount ? true : undefined}
                aria-describedby={describedBy(
                  ids.toAmountHint,
                  errors.toAmount && ids.toAmountError,
                )}
                className={`${inputClass} tabular-nums`}
              />
              <p id={ids.toAmountHint} className="text-sm text-foreground-muted">
                {t('transactions.form.amountHint', { unit: unitOf(toCurrency) })}
              </p>
              {errors.toAmount && (
                <p id={ids.toAmountError} className="text-sm text-danger">
                  {t(errors.toAmount)}
                </p>
              )}
            </div>
          )}
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
        {activeLabels.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{t('transactions.form.labels')}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {activeLabels.map((label) => (
                <label key={label.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={labelIds.includes(label.id)}
                    onChange={(e) => {
                      changed();
                      const checked = e.target.checked;
                      setLabelIds((current) =>
                        checked ? [...current, label.id] : current.filter((x) => x !== label.id),
                      );
                    }}
                    className="size-4"
                  />
                  {label.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
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
