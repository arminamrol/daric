import { ApiError } from '@daric/api-client';
import { IRR, parseAmount, parseDisplayDay } from '@daric/core';
import type { Account, ParseAmountError } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { currencyOf } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { CALENDAR_LABELS, CURRENCY_NAMES, MONEY_DISPLAY_UNITS } from '../settings/labels';
import { useFormatters } from '../settings/settings';
import { useCreateValuation } from './net-worth';

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger';

const AMOUNT_ERRORS: Record<ParseAmountError, PlainMessageKey> = {
  empty: 'valuations.error.amountRequired',
  invalid: 'accounts.error.amountInvalid',
  too_many_decimals: 'accounts.error.amountTooPrecise',
  out_of_range: 'accounts.error.amountTooLarge',
};

type Field = 'amount' | 'day';

/**
 * Enters what `account` is worth on a day, in its currency, typed as money is
 * shown (IRR in tomans when the Workspace shows tomans). Today by default.
 */
export function ValuationForm({ account }: { account: Account }) {
  const { t } = useI18n();
  const format = useFormatters();
  const { me, workspace } = useSignedIn();
  const { displayCalendar } = me.preferences;
  const id = useId();
  const fieldId = (key: string) => `${id}-${key}`;
  const currency = currencyOf(account);
  const refs = {
    amount: useRef<HTMLInputElement>(null),
    day: useRef<HTMLInputElement>(null),
  };
  const [text, setText] = useState('');
  const [day, setDay] = useState(() => format.day(format.today(new Date())));
  const [errors, setErrors] = useState<Partial<Record<Field, PlainMessageKey>>>({});
  const [problem, setProblem] = useState<PlainMessageKey | null>(null);
  const create = useCreateValuation(account.id);
  const unitName =
    currency.code === IRR.code
      ? MONEY_DISPLAY_UNITS[workspace.moneyDisplay]
      : CURRENCY_NAMES[currency.code];

  function changed() {
    create.reset();
    setProblem(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(text, currency, { display: workspace.moneyDisplay });
    const valuedOn = parseDisplayDay(day, displayCalendar);
    const found: Partial<Record<Field, PlainMessageKey>> = {};
    if (!parsed.ok) found.amount = AMOUNT_ERRORS[parsed.error];
    else if (parsed.money.amount < 0n) found.amount = 'valuations.error.negative';
    if (!valuedOn) found.day = 'transactions.error.day';
    setErrors(found);
    const first = (['amount', 'day'] as const).find((key) => found[key]);
    if (first) return refs[first].current?.focus();
    if (!parsed.ok || !valuedOn) return;

    create.mutate(
      { amount: parsed.money.amount, valuedOn },
      {
        onSuccess: () => setText(''),
        // A 409 means the Account already has a Valuation that day.
        onError: (error) =>
          setProblem(
            error instanceof ApiError && error.status === 409
              ? 'valuations.error.dayTaken'
              : 'settings.saveFailed',
          ),
      },
    );
  }

  function field(key: Field, label: string, hint: string, value: string, set: (v: string) => void) {
    const errorId = fieldId(`${key}-error`);
    const hintId = fieldId(`${key}-hint`);
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId(key)} className="font-medium">
          {label}
        </label>
        <input
          id={fieldId(key)}
          ref={refs[key]}
          value={value}
          inputMode={key === 'amount' ? 'decimal' : 'numeric'}
          autoComplete="off"
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={[errors[key] && errorId, hintId].filter(Boolean).join(' ')}
          onChange={(e) => {
            changed();
            set(e.target.value);
          }}
          className={inputClass}
        />
        {errors[key] && (
          <p id={errorId} className="text-sm text-danger">
            {t(errors[key])}
          </p>
        )}
        <p id={hintId} className="text-sm text-foreground-muted">
          {hint}
        </p>
      </div>
    );
  }

  const titleId = fieldId('title');
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6">
      <h2 id={titleId} className="text-lg font-bold">
        {t('valuations.form.title')}
      </h2>
      <form
        aria-labelledby={titleId}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-5"
      >
        {field(
          'amount',
          t('valuations.form.amount'),
          t('valuations.form.amountHint', { unit: unitName ? t(unitName) : currency.code }),
          text,
          setText,
        )}
        {field(
          'day',
          t('valuations.form.day'),
          t('valuations.form.dayHint', { calendar: t(CALENDAR_LABELS[displayCalendar]) }),
          day,
          setDay,
        )}
        {problem && (
          <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
            {t(problem)}
          </p>
        )}
        <button
          type="submit"
          disabled={create.isPending}
          className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60"
        >
          {t('valuations.form.create')}
        </button>
      </form>
    </section>
  );
}
