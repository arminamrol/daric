import { currencyOf, rateDayOf, toBaseCurrency } from '@daric/core';
import type { CurrencyTotals, Money, Period } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { RateNotes } from './RateNotes';
import { useExchangeRates } from './rates';

function IncomeExpense({ income, expense }: { income: Money; expense: Money }) {
  const { t } = useI18n();
  const format = useFormatters();
  return (
    <div className="flex gap-3 text-sm tabular-nums">
      {income.amount !== 0n && (
        <p className="text-success">
          {t('transactions.list.income', { amount: isolate(format.money(income)) })}
        </p>
      )}
      {expense.amount !== 0n && (
        <p className="text-foreground-muted">
          {t('transactions.list.expense', { amount: isolate(format.money(expense)) })}
        </p>
      )}
    </div>
  );
}

/**
 * A Period's Income and Expense in the Base Currency, converted at each
 * currency's rate on the Period's last day (or today), with the rates used,
 * missing rates and the totals per currency beneath. Until the rates load,
 * or when every Amount is in the Base Currency, only the per-currency totals show.
 */
export function PeriodTotals({ period, totals }: { period: Period; totals: CurrencyTotals[] }) {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const rates = useExchangeRates();
  const base = currencyOf(workspace.baseCurrency);
  const mixed = totals.some((total) => total.currency.code !== base.code);

  if (!mixed || !rates.data) {
    return totals.map((total) => <IncomeExpense key={total.currency.code} {...total} />);
  }

  const day = rateDayOf(period, workspace.calendar, format.today(new Date()));
  const income = toBaseCurrency(
    totals.map((total) => total.income),
    base,
    rates.data,
    day,
  );
  const expense = toBaseCurrency(
    totals.map((total) => total.expense),
    base,
    rates.data,
    day,
  );
  // Income and Expense convert on the same day, so one rate serves both.
  const ratesUsed = [...income.ratesUsed, ...expense.ratesUsed].filter(
    (rate, index, all) => all.findIndex((r) => r.currency === rate.currency) === index,
  );
  const missing = [...income.missing, ...expense.missing].filter(
    (currency, index, all) => all.findIndex((c) => c.code === currency.code) === index,
  );

  return (
    <div className="flex basis-full flex-col gap-1">
      <IncomeExpense income={income.total} expense={expense.total} />
      <div className="flex flex-col gap-1 text-sm text-foreground-muted tabular-nums">
        <p className="sr-only">{t('totals.byCurrency')}</p>
        {totals.map((total) => (
          <p key={total.currency.code}>
            {t('totals.currencyLine', {
              currency: format.currency(total.currency),
              amounts: [
                total.income.amount !== 0n &&
                  t('transactions.list.income', { amount: isolate(format.money(total.income)) }),
                total.expense.amount !== 0n &&
                  t('transactions.list.expense', {
                    amount: isolate(format.money(total.expense)),
                  }),
              ]
                .filter(Boolean)
                .join(t('totals.separator')),
            })}
          </p>
        ))}
      </div>
      <RateNotes ratesUsed={ratesUsed} missing={missing} day={day} />
    </div>
  );
}
