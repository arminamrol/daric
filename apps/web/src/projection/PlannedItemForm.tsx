import { currencyByCode, money, parseAmount, parseDisplayDay, plannedItemKinds } from '@daric/core';
import type {
  Category,
  ParseAmountError,
  PlannedItem,
  PlannedItemKind,
  TransactionType,
} from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { CALENDAR_LABELS, CURRENCY_NAMES, MONEY_DISPLAY_UNITS } from '../settings/labels';
import { useFormatters } from '../settings/settings';
import { categoryChoices } from '../transactions/choices';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useCreatePlannedItem, useDeletePlannedItem, useUpdatePlannedItem } from './planned-items';

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger';

const AMOUNT_ERRORS: Record<ParseAmountError, PlainMessageKey> = {
  empty: 'transactions.error.amountRequired',
  invalid: 'accounts.error.amountInvalid',
  too_many_decimals: 'accounts.error.amountTooPrecise',
  out_of_range: 'accounts.error.amountTooLarge',
};

const TYPES: readonly TransactionType[] = ['EXPENSE', 'INCOME'];

type Field = 'name' | 'category' | 'amount' | 'start' | 'end';
type FieldErrors = Partial<Record<Field, PlainMessageKey>>;

/**
 * Makes a Planned Item, or changes and deletes `item`. Its kind and type stay
 * as made. The Amount is in the Base Currency (the item's own once made);
 * days are typed in the display calendar, while a Fixed Monthly item repeats
 * on the Workspace Calendar.
 */
export function PlannedItemForm({
  item,
  categories,
}: {
  item?: PlannedItem;
  /** Archived ones are offered only when `item` is in them. */
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
    start: useRef<HTMLInputElement>(null),
    end: useRef<HTMLInputElement>(null),
  };

  const currency = currencyByCode(item?.currency ?? workspace.baseCurrency);
  const [name, setName] = useState(item?.name ?? '');
  const [kind, setKind] = useState<PlannedItemKind>(item?.kind ?? 'FIXED_MONTHLY');
  const [type, setType] = useState<TransactionType>(item?.type ?? 'EXPENSE');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [amount, setAmount] = useState(() =>
    item ? format.money(money(item.amount, currency), { label: false, grouping: false }) : '',
  );
  const [start, setStart] = useState(() => format.day(item?.startOn ?? format.today(new Date())));
  const [end, setEnd] = useState(() => (item?.endOn ? format.day(item.endOn) : ''));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failed, setFailed] = useState(false);
  const create = useCreatePlannedItem();
  const update = useUpdatePlannedItem(item?.id ?? '');
  const remove = useDeletePlannedItem(item?.id ?? '');
  const save = item ? update : create;
  const monthly = kind === 'FIXED_MONTHLY';

  const categoryOptions = useMemo(
    () =>
      categoryChoices(
        categories.filter((c) => c.kind === type && (!c.archived || c.id === item?.categoryId)),
        t,
      ),
    [categories, type, item, t],
  );

  const unitName =
    currency.code === 'IRR'
      ? MONEY_DISPLAY_UNITS[workspace.moneyDisplay]
      : CURRENCY_NAMES[currency.code];
  const unit = unitName ? t(unitName) : currency.code;

  function changed() {
    save.reset();
    setFailed(false);
  }

  function done() {
    void navigate('/projection');
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(amount, currency, { display: workspace.moneyDisplay });
    const startOn = parseDisplayDay(start, displayCalendar);
    const endOn = !monthly || end.trim() === '' ? null : parseDisplayDay(end, displayCalendar);
    const found: FieldErrors = {};
    if (name.trim() === '') found.name = 'plannedItems.error.name';
    if (categoryId === '' ? monthly : !categoryOptions.some((c) => c.id === categoryId)) {
      found.category = 'plannedItems.error.category';
    }
    if (!parsed.ok) found.amount = AMOUNT_ERRORS[parsed.error];
    else if (parsed.money.amount <= 0n) found.amount = 'transactions.error.amountPositive';
    if (!startOn) found.start = 'transactions.error.day';
    if (endOn === undefined) found.end = 'transactions.error.day';
    else if (endOn && startOn && endOn < startOn) found.end = 'plannedItems.error.endBeforeStart';
    setErrors(found);
    const first = (Object.keys(refs) as Field[]).find((field) => found[field]);
    if (first) return refs[first].current?.focus();
    if (!parsed.ok || !startOn || endOn === undefined) return;

    const fields = {
      name: name.trim(),
      categoryId: categoryId === '' ? null : categoryId,
      amount: parsed.money.amount,
      startOn,
      endOn,
    };
    if (item) {
      // Only real changes, so the audit log names them.
      const changes = Object.fromEntries(
        Object.entries(fields).filter(([key, value]) => item[key as keyof typeof fields] !== value),
      );
      if (Object.keys(changes).length === 0) return done();
      update.mutate(changes, { onSuccess: done, onError: () => setFailed(true) });
    } else {
      create.mutate({ ...fields, kind, type }, { onSuccess: done, onError: () => setFailed(true) });
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

  /** A text input for `field`; days are typed as digits. */
  const text =
    (key: 'name' | 'start' | 'end', value: string, set: (value: string) => void, numeric = false) =>
    (props: Parameters<Parameters<typeof field>[3]>[0]) => (
      <input
        {...props}
        ref={refs[key]}
        value={value}
        {...(numeric ? { inputMode: 'numeric' } : {})}
        autoComplete="off"
        onChange={(e) => {
          changed();
          set(e.target.value);
        }}
        className={inputClass}
      />
    );

  const titleId = fieldId('title');
  const deleteHintId = fieldId('delete-hint');

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6">
      <div className="flex items-center gap-3">
        <h1 id={titleId} className="me-auto text-2xl font-bold">
          {t(item ? 'plannedItems.form.editTitle' : 'plannedItems.form.newTitle')}
        </h1>
        <Link
          to="/projection"
          className="text-sm font-medium text-accent underline underline-offset-4"
        >
          {t('plannedItems.back')}
        </Link>
      </div>
      <form
        aria-labelledby={titleId}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-5"
      >
        {field(
          'name',
          t('plannedItems.form.name'),
          t('plannedItems.form.nameHint'),
          text('name', name, setName),
        )}
        {!item && (
          <>
            <SegmentedControl
              legend={t('plannedItems.form.kind')}
              choices={plannedItemKinds.map((value) => ({
                value,
                label: t(`plannedItems.kind.${value}`),
              }))}
              value={kind}
              onChange={(value) => {
                changed();
                setKind(value);
              }}
            />
            <SegmentedControl
              legend={t('plannedItems.form.type')}
              choices={TYPES.map((value) => ({ value, label: t(`transactions.type.${value}`) }))}
              value={type}
              onChange={(value) => {
                changed();
                setType(value);
                setCategoryId('');
              }}
            />
          </>
        )}
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
            <option value="">{monthly ? '' : t('plannedItems.form.noCategory')}</option>
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
          t('plannedItems.form.amountHint', { unit }),
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
        {field(
          'start',
          t(monthly ? 'plannedItems.form.start' : 'plannedItems.form.day'),
          t('plannedItems.form.startHint', { calendar: t(CALENDAR_LABELS[displayCalendar]) }),
          text('start', start, setStart, true),
        )}
        {monthly &&
          field(
            'end',
            t('plannedItems.form.end'),
            t('plannedItems.form.endHint'),
            text('end', end, setEnd, true),
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
          {t(item ? 'plannedItems.form.save' : 'plannedItems.form.create')}
        </button>
      </form>
      {item && (
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(undefined, { onSuccess: done, onError: () => setFailed(true) })
            }
            aria-describedby={deleteHintId}
            className="w-fit rounded-md border border-border px-4 py-2 font-medium text-danger disabled:opacity-60"
          >
            {t('plannedItems.form.delete')}
          </button>
          <p id={deleteHintId} className="text-sm text-foreground-muted">
            {t('plannedItems.form.deleteHint')}
          </p>
        </div>
      )}
    </section>
  );
}
