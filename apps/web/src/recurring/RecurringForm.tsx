import {
  IRR,
  money,
  parseAmount,
  parseDisplayDay,
  recurrenceFrequencies,
  toLatinDigits,
} from '@daric/core';
import type {
  Account,
  Category,
  ParseAmountError,
  RecurrenceFrequency,
  RecurringRule,
  TransactionType,
} from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { currencyOf } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { CALENDAR_LABELS, CURRENCY_NAMES, MONEY_DISPLAY_UNITS } from '../settings/labels';
import { useFormatters } from '../settings/settings';
import { categoryChoices } from '../transactions/choices';
import { SegmentedControl } from '../ui/SegmentedControl';
import { FREQUENCY_LABELS } from './labels';
import { useCreateRecurringRule, useUpdateRecurringRule } from './recurring';

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger';

const AMOUNT_ERRORS: Record<ParseAmountError, PlainMessageKey> = {
  empty: 'transactions.error.amountRequired',
  invalid: 'accounts.error.amountInvalid',
  too_many_decimals: 'accounts.error.amountTooPrecise',
  out_of_range: 'accounts.error.amountTooLarge',
};

const TYPES: readonly TransactionType[] = ['EXPENSE', 'INCOME'];

type Field = 'name' | 'category' | 'amount' | 'interval' | 'start' | 'end';
type FieldErrors = Partial<Record<Field, PlainMessageKey>>;

/**
 * Makes a Recurring Rule, or changes and archives `rule`. The Amount is in
 * the Account's currency, typed as shown; days are typed in the display
 * calendar, while the rule repeats on the Workspace Calendar.
 */
export function RecurringForm({
  rule,
  accounts,
  categories,
}: {
  rule?: RecurringRule;
  /** Archived ones are offered only when `rule` is on them; the same goes for Categories. */
  accounts: readonly Account[];
  categories: readonly Category[];
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const navigate = useNavigate();
  const { me, workspace } = useSignedIn();
  const { displayCalendar } = me.preferences;
  const id = useId();
  const fieldId = (name: string) => `${id}-${name}`;
  const refs = {
    name: useRef<HTMLInputElement>(null),
    category: useRef<HTMLSelectElement>(null),
    amount: useRef<HTMLInputElement>(null),
    interval: useRef<HTMLInputElement>(null),
    start: useRef<HTMLInputElement>(null),
    end: useRef<HTMLInputElement>(null),
  };

  const offeredAccounts = accounts.filter((a) => !a.archived || a.id === rule?.accountId);
  const [name, setName] = useState(rule?.name ?? '');
  const [type, setType] = useState<TransactionType>(rule?.type ?? 'EXPENSE');
  const [accountId, setAccountId] = useState(rule?.accountId ?? offeredAccounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const account = offeredAccounts.find((a) => a.id === accountId);
  const currency = account ? currencyOf(account) : IRR;
  const [amount, setAmount] = useState(() =>
    rule ? format.money(money(rule.amount, currency), { label: false, grouping: false }) : '',
  );
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(rule?.frequency ?? 'MONTHLY');
  const [interval, setIntervalText] = useState(() => format.count(rule?.interval ?? 1));
  const [start, setStart] = useState(() => format.day(rule?.startOn ?? format.today(new Date())));
  const [end, setEnd] = useState(() => (rule?.endOn ? format.day(rule.endOn) : ''));
  const [autoPost, setAutoPost] = useState(rule?.autoPost ?? false);
  const [archived, setArchived] = useState(rule?.archived ?? false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failed, setFailed] = useState(false);
  const create = useCreateRecurringRule();
  const update = useUpdateRecurringRule(rule?.id ?? '');
  const save = rule ? update : create;

  const categoryOptions = useMemo(
    () =>
      categoryChoices(
        categories.filter((c) => c.kind === type && (!c.archived || c.id === rule?.categoryId)),
        t,
      ),
    [categories, type, rule, t],
  );

  const unitName =
    currency.code === IRR.code
      ? MONEY_DISPLAY_UNITS[workspace.moneyDisplay]
      : CURRENCY_NAMES[currency.code];
  const unit = unitName ? t(unitName) : currency.code;

  function changed() {
    save.reset();
    setFailed(false);
  }

  function done() {
    void navigate('/recurring');
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(amount, currency, { display: workspace.moneyDisplay });
    const intervalValue = Number(toLatinDigits(interval).trim());
    const startOn = parseDisplayDay(start, displayCalendar);
    const endOn = end.trim() === '' ? null : parseDisplayDay(end, displayCalendar);
    const found: FieldErrors = {};
    if (name.trim() === '') found.name = 'recurring.error.name';
    if (!categoryOptions.some((c) => c.id === categoryId)) {
      found.category = 'transactions.error.category';
    }
    if (!parsed.ok) found.amount = AMOUNT_ERRORS[parsed.error];
    else if (parsed.money.amount <= 0n) found.amount = 'transactions.error.amountPositive';
    if (!Number.isInteger(intervalValue) || intervalValue < 1 || intervalValue > 52) {
      found.interval = 'recurring.error.interval';
    }
    if (!startOn) found.start = 'transactions.error.day';
    if (endOn === undefined) found.end = 'transactions.error.day';
    else if (endOn && startOn && endOn < startOn) found.end = 'recurring.error.endBeforeStart';
    setErrors(found);
    const first = (Object.keys(refs) as Field[]).find((field) => found[field]);
    if (first) return refs[first].current?.focus();
    if (!parsed.ok || !startOn || endOn === undefined || !account) return;

    const fields = {
      name: name.trim(),
      type,
      accountId: account.id,
      categoryId,
      amount: parsed.money.amount,
      frequency,
      interval: intervalValue,
      startOn,
      endOn,
      autoPost,
    };
    if (rule) {
      // Only real changes, so the audit log names them.
      const changes = Object.fromEntries(
        Object.entries({ ...fields, archived }).filter(
          ([key, value]) => rule[key as keyof typeof fields | 'archived'] !== value,
        ),
      );
      if (Object.keys(changes).length === 0) return done();
      update.mutate(changes, { onSuccess: done, onError: () => setFailed(true) });
    } else {
      create.mutate(fields, { onSuccess: done, onError: () => setFailed(true) });
    }
  }

  /** A labelled field with its error and hint, both read with it. */
  function field(
    key: Field,
    label: string,
    hint: string | undefined,
    control: (props: {
      id: string;
      'aria-invalid': true | undefined;
      'aria-describedby': string | undefined;
    }) => ReactNode,
  ) {
    const errorId = fieldId(`${key}-error`);
    const hintId = fieldId(`${key}-hint`);
    const describedBy = [errors[key] && errorId, hint && hintId].filter(Boolean).join(' ');
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId(key)} className="font-medium">
          {label}
        </label>
        {control({
          id: fieldId(key),
          'aria-invalid': errors[key] ? true : undefined,
          'aria-describedby': describedBy || undefined,
        })}
        {errors[key] && (
          <p id={errorId} className="text-sm text-danger">
            {t(errors[key])}
          </p>
        )}
        {hint && (
          <p id={hintId} className="text-sm text-foreground-muted">
            {hint}
          </p>
        )}
      </div>
    );
  }

  const titleId = fieldId('title');
  const checkbox = (
    key: string,
    label: string,
    hint: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
  ) => (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          id={fieldId(key)}
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            changed();
            onChange(e.target.checked);
          }}
          aria-describedby={fieldId(`${key}-hint`)}
        />
        <label htmlFor={fieldId(key)} className="font-medium">
          {label}
        </label>
      </div>
      <p id={fieldId(`${key}-hint`)} className="text-sm text-foreground-muted">
        {hint}
      </p>
    </div>
  );

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6">
      <div className="flex items-center gap-3">
        <h1 id={titleId} className="me-auto text-2xl font-bold">
          {t(rule ? 'recurring.form.editTitle' : 'recurring.form.newTitle')}
        </h1>
        <Link
          to="/recurring"
          className="text-sm font-medium text-accent underline underline-offset-4"
        >
          {t('recurring.back')}
        </Link>
      </div>
      <form
        aria-labelledby={titleId}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-5"
      >
        {field('name', t('recurring.form.name'), t('recurring.form.nameHint'), (props) => (
          <input
            {...props}
            ref={refs.name}
            value={name}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => {
              changed();
              setName(e.target.value);
            }}
            className={inputClass}
          />
        ))}
        <SegmentedControl
          legend={t('recurring.form.type')}
          choices={TYPES.map((value) => ({ value, label: t(`transactions.type.${value}`) }))}
          value={type}
          onChange={(value) => {
            changed();
            setType(value);
            setCategoryId('');
          }}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={fieldId('account')} className="font-medium">
            {t('transactions.form.account')}
          </label>
          <select
            id={fieldId('account')}
            value={accountId}
            onChange={(e) => {
              changed();
              setAccountId(e.target.value);
            }}
            className={inputClass}
          >
            {offeredAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        {field('category', t('transactions.form.category'), undefined, (props) => (
          <select
            {...props}
            ref={refs.category}
            value={categoryId}
            onChange={(e) => {
              changed();
              setCategoryId(e.target.value);
            }}
            className={inputClass}
          >
            {categoryId === '' && <option value="" />}
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        ))}
        {field(
          'amount',
          t('transactions.form.amount'),
          t('recurring.form.amountHint', { unit }),
          (props) => (
            <input
              {...props}
              ref={refs.amount}
              value={amount}
              inputMode="decimal"
              autoComplete="off"
              onChange={(e) => {
                changed();
                setAmount(e.target.value);
              }}
              className={inputClass}
            />
          ),
        )}
        <SegmentedControl
          legend={t('recurring.form.frequency')}
          choices={recurrenceFrequencies.map((value) => ({
            value,
            label: t(FREQUENCY_LABELS[value]),
          }))}
          value={frequency}
          onChange={(value) => {
            changed();
            setFrequency(value);
          }}
        />
        {field(
          'interval',
          t('recurring.form.interval'),
          t('recurring.form.intervalHint'),
          (props) => (
            <input
              {...props}
              ref={refs.interval}
              value={interval}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => {
                changed();
                setIntervalText(e.target.value);
              }}
              className={inputClass}
            />
          ),
        )}
        {field(
          'start',
          t('recurring.form.start'),
          t('recurring.form.startHint', { calendar: t(CALENDAR_LABELS[displayCalendar]) }),
          (props) => (
            <input
              {...props}
              ref={refs.start}
              value={start}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => {
                changed();
                setStart(e.target.value);
              }}
              className={inputClass}
            />
          ),
        )}
        {field('end', t('recurring.form.end'), t('recurring.form.endHint'), (props) => (
          <input
            {...props}
            ref={refs.end}
            value={end}
            inputMode="numeric"
            autoComplete="off"
            onChange={(e) => {
              changed();
              setEnd(e.target.value);
            }}
            className={inputClass}
          />
        ))}
        {checkbox(
          'auto-post',
          t('recurring.form.autoPost'),
          t('recurring.form.autoPostHint'),
          autoPost,
          setAutoPost,
        )}
        {rule &&
          checkbox(
            'archive',
            t('recurring.form.archive'),
            t('recurring.form.archiveHint'),
            archived,
            setArchived,
          )}
        {failed && (
          <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
            {t('settings.saveFailed')}
          </p>
        )}
        <button
          type="submit"
          disabled={save.isPending}
          className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60"
        >
          {t(rule ? 'recurring.form.save' : 'recurring.form.create')}
        </button>
      </form>
    </section>
  );
}
