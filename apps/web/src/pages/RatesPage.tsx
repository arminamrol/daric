import { currencyOf, hasRole, rateOn } from '@daric/core';
import type { ExchangeRateWire } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useId } from 'react';
import { Link } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useExchangeRates, useRateEquation } from '../rates/rates';
import { useFormatters } from '../settings/settings';

function CurrencyRates({
  currency,
  rates,
  canManage,
}: {
  currency: string;
  /** Newest first. */
  rates: ExchangeRateWire[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const equation = useRateEquation();
  const titleId = useId();
  const inForce = rateOn(rates, currency, format.today(new Date()));

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-lg font-bold">
        {format.currency(currencyOf(currency))}
      </h2>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {rates.map((rate) => {
          const day = format.day(rate.effectiveOn);
          const text = t('rates.equation', equation(rate));
          return (
            <li key={rate.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <div className="me-auto flex flex-col">
                {canManage ? (
                  <Link
                    to={`/rates/${rate.id}`}
                    aria-label={t('rates.edit', {
                      currency: isolate(format.currency(currencyOf(currency))),
                      day: isolate(day),
                    })}
                    className="font-medium tabular-nums underline-offset-4 hover:underline"
                  >
                    {text}
                  </Link>
                ) : (
                  <span className="font-medium tabular-nums">{text}</span>
                )}
                <span className="text-sm text-foreground-muted">
                  {t('rates.from', { day: isolate(day) })}
                </span>
              </div>
              {rate.id === inForce?.id && (
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-sm">
                  {t('rates.inForce')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** `/rates`: every Member sees the Exchange Rates, Owners and Admins change them. */
export function RatesPage() {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const rates = useExchangeRates();
  const canManage = hasRole(workspace.role, 'ADMIN');
  // The API lists them by currency, newest first.
  const byCurrency = new Map<string, ExchangeRateWire[]>();
  for (const rate of rates.data ?? []) {
    byCurrency.set(rate.currency, [...(byCurrency.get(rate.currency) ?? []), rate]);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-2xl font-bold">{t('rates.title')}</h1>
        {canManage && (
          <Link
            to="/rates/new"
            className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary"
          >
            {t('rates.new')}
          </Link>
        )}
      </div>
      <p className="text-sm text-foreground-muted">
        {t('rates.intro', { base: format.currency(currencyOf(workspace.baseCurrency)) })}
      </p>
      {!canManage && <p className="text-sm text-foreground-muted">{t('rates.readOnly')}</p>}
      {rates.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : rates.isError ? (
        <p role="alert" className="text-danger">
          {t('rates.loadFailed')}
        </p>
      ) : byCurrency.size === 0 ? (
        <p className="text-foreground-muted">{t('rates.empty')}</p>
      ) : (
        [...byCurrency].map(([currency, list]) => (
          <CurrencyRates key={currency} currency={currency} rates={list} canManage={canManage} />
        ))
      )}
    </div>
  );
}
