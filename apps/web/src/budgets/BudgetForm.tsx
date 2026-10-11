import { ApiError } from '@daric/api-client';
import { budgetPeriods, IRR, money, parseAmount } from '@daric/core';
import type { Budget, BudgetPeriod, Category, Label, ParseAmountError } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { currencyOf } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { CURRENCY_NAMES, MONEY_DISPLAY_UNITS } from '../settings/labels';
import { useFormatters } from '../settings/settings';
import { categoryChoices } from '../transactions/choices';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import { useCreateBudget, useDeleteBudget, useUpdateBudget } from './budgets';
import { BUDGET_PERIOD_LABELS } from './labels';

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger';

const AMOUNT_ERRORS: Record<ParseAmountError, PlainMessageKey> = {
  empty: 'budgets.error.amountRequired',
  invalid: 'accounts.error.amountInvalid',
  too_many_decimals: 'accounts.error.amountTooPrecise',
  out_of_range: 'accounts.error.amountTooLarge',
};

interface FieldErrors {
  category?: PlainMessageKey;
  amount?: PlainMessageKey;
}

/**
 * Creates a Budget, or changes and deletes `budget`. The limit is in the
 * Workspace's Base Currency (a Budget keeps the one it was made in), typed as
 * shown: in tomans when the Workspace shows IRR in tomans.
 */
export function BudgetForm({
  budget,
  categories,
  labels,
}: {
  budget?: Budget;
  categories: readonly Category[];
  labels: readonly Label[];
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const navigate = useNavigate();
  const { workspace } = useSignedIn();
  const id = useId();
  const ids = {
    title: `${id}-title`,
    category: `${id}-category`,
    categoryHint: `${id}-category-hint`,
    categoryError: `${id}-category-error`,
    label: `${id}-label`,
    labelHint: `${id}-label-hint`,
    amount: `${id}-amount`,
    amountHint: `${id}-amount-hint`,
    amountError: `${id}-amount-error`,
    deleteHint: `${id}-delete-hint`,
  };
  const categoryRef = useRef<HTMLSelectElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const currency = currencyOf({ currency: budget?.currency ?? workspace.baseCurrency });
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? '');
  const [labelId, setLabelId] = useState(budget?.labelId ?? '');
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? 'MONTHLY');
  const [amount, setAmount] = useState(() =>
    budget ? format.money(money(budget.amount, currency), { label: false, grouping: false }) : '',
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<PlainMessageKey | null>(null);
  const create = useCreateBudget();
  const update = useUpdateBudget(budget?.id ?? '');
  const remove = useDeleteBudget(budget?.id ?? '');
  const save = budget ? update : create;

  // Active Expense Categories and Labels, plus the archived ones this Budget already has.
  const categoryOptions = useMemo(
    () =>
      categoryChoices(
        categories.filter(
          (c) => c.kind === 'EXPENSE' && (!c.archived || c.id === budget?.categoryId),
        ),
        t,
      ),
    [categories, budget, t],
  );
  const labelOptions = labels.filter((l) => !l.archived || l.id === budget?.labelId);

  const unitName =
    currency.code === IRR.code
      ? MONEY_DISPLAY_UNITS[workspace.moneyDisplay]
      : CURRENCY_NAMES[currency.code];
  const unit = unitName ? t(unitName) : currency.code;

  function changed() {
    save.reset();
    setProblem(null);
  }

  /** A 409 means the Category already has a Budget for this Label and Period. */
  function onError(error: Error) {
    setProblem(
      error instanceof ApiError && error.status === 409
        ? 'budgets.error.taken'
        : 'settings.saveFailed',
    );
  }

  function done() {
    void navigate('/budgets');
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(amount, currency, { display: workspace.moneyDisplay });
    const found: FieldErrors = {};
    if (categoryId === '') found.category = 'budgets.error.category';
    if (!parsed.ok) found.amount = AMOUNT_ERRORS[parsed.error];
    else if (parsed.money.amount <= 0n) found.amount = 'budgets.error.amountPositive';
    setErrors(found);
    if (found.category) return categoryRef.current?.focus();
    if (!parsed.ok || found.amount) return amountRef.current?.focus();

    const fields = {
      categoryId,
      labelId: labelId === '' ? null : labelId,
      period,
      amount: parsed.money.amount,
    };
    if (budget) {
      // Only real changes, so the audit log names them.
      const changes = Object.fromEntries(
        Object.entries(fields).filter(
          ([key, value]) => budget[key as keyof typeof fields] !== value,
        ),
      );
      if (Object.keys(changes).length === 0) return done();
      update.mutate(changes, { onSuccess: done, onError });
    } else {
      create.mutate(fields, { onSuccess: done, onError });
    }
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6">
      <div className="flex items-center gap-3">
        <h1 id={ids.title} className="me-auto text-2xl font-bold">
          {t(budget ? 'budgets.form.editTitle' : 'budgets.form.newTitle')}
        </h1>
        <Link
          to="/budgets"
          className="text-sm font-medium text-accent underline underline-offset-4"
        >
          {t('budgets.back')}
        </Link>
      </div>
      <form
        aria-labelledby={ids.title}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.category} className="font-medium">
            {t('budgets.form.category')}
          </label>
          <select
            ref={categoryRef}
            id={ids.category}
            value={categoryId}
            onChange={(e) => {
              changed();
              setCategoryId(e.target.value);
            }}
            aria-invalid={errors.category ? true : undefined}
            aria-describedby={
              errors.category ? `${ids.categoryError} ${ids.categoryHint}` : ids.categoryHint
            }
            className={inputClass}
          >
            {categoryId === '' && <option value="" />}
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {errors.category && (
            <p id={ids.categoryError} className="text-sm text-danger">
              {t(errors.category)}
            </p>
          )}
          <p id={ids.categoryHint} className="text-sm text-foreground-muted">
            {t('budgets.form.categoryHint')}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.label} className="font-medium">
            {t('budgets.form.label')}
          </label>
          <select
            id={ids.label}
            value={labelId}
            onChange={(e) => {
              changed();
              setLabelId(e.target.value);
            }}
            aria-describedby={ids.labelHint}
            className={inputClass}
          >
            <option value="">{t('budgets.form.anyLabel')}</option>
            {labelOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <p id={ids.labelHint} className="text-sm text-foreground-muted">
            {t('budgets.form.labelHint')}
          </p>
        </div>
        <ChoiceGroup
          legend={t('budgets.form.period')}
          choices={budgetPeriods.map((value) => ({
            value,
            label: t(BUDGET_PERIOD_LABELS[value]),
          }))}
          value={period}
          onChange={(value) => {
            changed();
            setPeriod(value);
          }}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.amount} className="font-medium">
            {t('budgets.form.amount')}
          </label>
          <input
            ref={amountRef}
            id={ids.amount}
            value={amount}
            inputMode="decimal"
            autoComplete="off"
            onChange={(e) => {
              changed();
              setAmount(e.target.value);
            }}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={
              errors.amount ? `${ids.amountError} ${ids.amountHint}` : ids.amountHint
            }
            className={inputClass}
          />
          {errors.amount && (
            <p id={ids.amountError} className="text-sm text-danger">
              {t(errors.amount)}
            </p>
          )}
          <p id={ids.amountHint} className="text-sm text-foreground-muted">
            {t('budgets.form.amountHint', { unit })}
          </p>
        </div>
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
          {t(budget ? 'budgets.form.save' : 'budgets.form.create')}
        </button>
      </form>
      {budget && (
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
            aria-describedby={ids.deleteHint}
            className="w-fit rounded-md border border-border px-4 py-2 font-medium text-danger disabled:opacity-60"
          >
            {t('budgets.form.delete')}
          </button>
          <p id={ids.deleteHint} className="text-sm text-foreground-muted">
            {t('budgets.form.deleteHint')}
          </p>
        </div>
      )}
    </section>
  );
}
