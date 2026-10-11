import { ApiError } from '@daric/api-client';
import { currencies, currencyOf, parseDisplayDay, parseRate } from '@daric/core';
import type { ExchangeRateWire, ParseRateError } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { CALENDAR_LABELS } from '../settings/labels';
import { useFormatters } from '../settings/settings';
import { useCreateExchangeRate, useDeleteExchangeRate, useUpdateExchangeRate } from './rates';

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger';

const RATE_ERRORS: Record<ParseRateError, PlainMessageKey> = {
  empty: 'rates.error.rateRequired',
  invalid: 'rates.error.rateInvalid',
  not_positive: 'rates.error.ratePositive',
  too_many_decimals: 'rates.error.rateTooPrecise',
  out_of_range: 'rates.error.rateTooLarge',
};

type Field = 'currency' | 'rate' | 'day';

/**
 * Enters an Exchange Rate into the Workspace's Base Currency, or changes and
 * deletes `rate`. The rate is typed as money is shown: into IRR in tomans when
 * the Workspace shows IRR in tomans. Its currency is fixed once entered.
 */
export function RateForm({ rate }: { rate?: ExchangeRateWire }) {
  const { t } = useI18n();
  const format = useFormatters();
  const navigate = useNavigate();
  const { me, workspace } = useSignedIn();
  const { displayCalendar } = me.preferences;
  const id = useId();
  const fieldId = (key: string) => `${id}-${key}`;
  const base = currencyOf(workspace.baseCurrency);
  const choices = currencies.filter((c) => c.code !== base.code);
  const refs = {
    currency: useRef<HTMLSelectElement>(null),
    rate: useRef<HTMLInputElement>(null),
    day: useRef<HTMLInputElement>(null),
  };
  const [code, setCode] = useState(rate?.currency ?? choices[0]?.code ?? '');
  const [text, setText] = useState(() =>
    rate ? format.rate(rate.rate, currencyOf(rate.currency), base) : '',
  );
  const [day, setDay] = useState(() => format.day(rate?.effectiveOn ?? format.today(new Date())));
  const [errors, setErrors] = useState<Partial<Record<Field, PlainMessageKey>>>({});
  const [problem, setProblem] = useState<PlainMessageKey | null>(null);
  const create = useCreateExchangeRate();
  const update = useUpdateExchangeRate(rate?.id ?? '');
  const remove = useDeleteExchangeRate(rate?.id ?? '');
  const save = rate ? update : create;

  function changed() {
    save.reset();
    setProblem(null);
  }

  /** A 409 means the currency already has a rate on that day. */
  function onError(error: Error) {
    setProblem(
      error instanceof ApiError && error.status === 409
        ? 'rates.error.dayTaken'
        : 'settings.saveFailed',
    );
  }

  function done() {
    void navigate('/rates');
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currency = choices.find((c) => c.code === code);
    const parsed = currency
      ? parseRate(text, { currency, base, display: workspace.moneyDisplay })
      : undefined;
    const effectiveOn = parseDisplayDay(day, displayCalendar);
    const found: Partial<Record<Field, PlainMessageKey>> = {};
    if (!currency) found.currency = 'rates.form.noCurrency';
    else if (parsed && !parsed.ok) found.rate = RATE_ERRORS[parsed.error];
    if (!effectiveOn) found.day = 'transactions.error.day';
    setErrors(found);
    const first = (['currency', 'rate', 'day'] as const).find((key) => found[key]);
    if (first) return refs[first].current?.focus();
    if (!currency || !parsed?.ok || !effectiveOn) return;

    if (rate) {
      // Only real changes, so the audit log names them.
      const changes = {
        ...(parsed.rate !== rate.rate && { rate: parsed.rate }),
        ...(effectiveOn !== rate.effectiveOn && { effectiveOn }),
      };
      if (Object.keys(changes).length === 0) return done();
      update.mutate(changes, { onSuccess: done, onError });
    } else {
      create.mutate(
        { currency: currency.code, rate: parsed.rate, effectiveOn },
        {
          onSuccess: done,
          onError,
        },
      );
    }
  }

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

  const selected = choices.find((c) => c.code === code);
  const titleId = fieldId('title');
  const deleteHintId = fieldId('delete-hint');

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6">
      <div className="flex items-center gap-3">
        <h1 id={titleId} className="me-auto text-2xl font-bold">
          {t(rate ? 'rates.form.editTitle' : 'rates.form.newTitle')}
        </h1>
        <Link to="/rates" className="text-sm font-medium text-accent underline underline-offset-4">
          {t('rates.back')}
        </Link>
      </div>
      <form
        aria-labelledby={titleId}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-5"
      >
        {field('currency', t('rates.form.currency'), undefined, (props) => (
          <select
            {...props}
            ref={refs.currency}
            value={code}
            disabled={Boolean(rate)}
            onChange={(e) => {
              changed();
              setCode(e.target.value);
            }}
            className={inputClass}
          >
            {choices.map((c) => (
              <option key={c.code} value={c.code}>
                {format.currency(c)}
              </option>
            ))}
          </select>
        ))}
        {field(
          'rate',
          t('rates.form.rate'),
          selected &&
            t('rates.form.rateHint', {
              currency: format.currency(selected),
              base: format.currency(base),
            }),
          (props) => (
            <input
              {...props}
              ref={refs.rate}
              value={text}
              inputMode="decimal"
              autoComplete="off"
              onChange={(e) => {
                changed();
                setText(e.target.value);
              }}
              className={inputClass}
            />
          ),
        )}
        {field(
          'day',
          t('rates.form.day'),
          t('rates.form.dayHint', { calendar: t(CALENDAR_LABELS[displayCalendar]) }),
          (props) => (
            <input
              {...props}
              ref={refs.day}
              value={day}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => {
                changed();
                setDay(e.target.value);
              }}
              className={inputClass}
            />
          ),
        )}
        {problem && (
          <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
            {t(problem)}
          </p>
        )}
        <button
          type="submit"
          disabled={save.isPending}
          className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60"
        >
          {t(rate ? 'rates.form.save' : 'rates.form.create')}
        </button>
      </form>
      {rate && (
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: done,
                onError: () => setProblem('settings.saveFailed'),
              })
            }
            aria-describedby={deleteHintId}
            className="w-fit rounded-md border border-border px-4 py-2 font-medium text-danger disabled:opacity-60"
          >
            {t('rates.form.delete')}
          </button>
          <p id={deleteHintId} className="text-sm text-foreground-muted">
            {t('rates.form.deleteHint')}
          </p>
        </div>
      )}
    </section>
  );
}
