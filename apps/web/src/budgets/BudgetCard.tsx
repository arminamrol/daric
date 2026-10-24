import { money } from '@daric/core';
import type { Budget, Category } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useId } from 'react';
import { Link } from 'react-router';
import { currencyOf } from '../accounts/accounts';
import { BudgetProgress } from '../components/BudgetProgress';
import { CategoryBadge } from '../components/CategoryBadge';
import { useI18n } from '../i18n/locale';
import { useRateEquation } from '../rates/rates';
import { useFormatters } from '../settings/settings';
import { BUDGET_PERIOD_LABELS } from './labels';

/** One Budget with a progress bar for the Period it is shown in. */
export function BudgetCard({
  budget,
  name,
  category,
  canManage,
}: {
  budget: Budget;
  name: string;
  category: Category | undefined;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const equation = useRateEquation();
  const nameId = useId();
  const { progress } = budget;
  const currency = currencyOf(budget);
  const amount = (value: bigint) => format.money(money(value, currency));

  return (
    <article
      aria-labelledby={nameId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4"
    >
      <div className="flex items-center gap-3">
        {category && <CategoryBadge icon={category.icon} color={category.color} size="sm" />}
        <div className="me-auto flex flex-col">
          <h2 className="font-medium">
            {canManage ? (
              <Link
                to={`/budgets/${budget.id}`}
                aria-label={t('budgets.edit', { name: isolate(name) })}
                className="underline-offset-4 hover:underline"
              >
                <span id={nameId}>{name}</span>
              </Link>
            ) : (
              <span id={nameId}>{name}</span>
            )}
          </h2>
          <p className="text-sm text-foreground-muted">
            {t('budgets.periodOf', {
              period: t(BUDGET_PERIOD_LABELS[budget.period]),
              name: format.period(progress.period),
            })}
          </p>
        </div>
      </div>
      <BudgetProgress
        progress={progress}
        spent={amount(progress.spent)}
        limit={amount(budget.amount)}
        labelledBy={nameId}
      />
      <p className="text-sm text-foreground-muted">
        {progress.remaining < 0n
          ? t('budgets.overBy', { amount: isolate(amount(-progress.remaining)) })
          : t('budgets.remaining', { amount: isolate(amount(progress.remaining)) })}
      </p>
      {progress.ratesUsed.map((rate) => (
        <p key={rate.currency} className="text-sm text-foreground-muted tabular-nums">
          {t('budgets.rateUsed', {
            currency: format.currency(currencyOf(rate)),
            equation: isolate(t('rates.equation', equation(rate))),
            day: isolate(format.day(rate.effectiveOn)),
          })}
        </p>
      ))}
      {progress.otherCurrencyExpenses > 0 && (
        <p className="text-sm text-foreground-muted">{t('budgets.otherCurrency')}</p>
      )}
    </article>
  );
}
