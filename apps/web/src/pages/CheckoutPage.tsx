import { IRR, money, type PlusPrice } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useId, useState } from 'react';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { useCheckout, usePlusPrices, useSubscription } from '../settings/subscription';

const cardClass = 'flex flex-col gap-3 rounded-xl border border-border bg-surface px-6 py-5';

/** "3 months", in the User's digits. */
export function useMonthsLabel() {
  const { t } = useI18n();
  const format = useFormatters();
  return (months: number) =>
    t(months === 1 ? 'checkout.month' : 'checkout.months', {
      count: isolate(format.count(months)),
    });
}

function PriceChoice({
  price,
  name,
  checked,
  onChoose,
}: {
  price: PlusPrice;
  name: string;
  checked: boolean;
  onChoose: () => void;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const monthsLabel = useMonthsLabel();

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 has-checked:border-primary has-checked:bg-surface-muted has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus">
      <input
        type="radio"
        name={name}
        value={price.months}
        checked={checked}
        onChange={onChoose}
        className="accent-primary"
      />
      <span className="font-medium">{monthsLabel(price.months)}</span>
      <span className="ms-auto tabular-nums">{format.money(money(price.amount, IRR))}</span>
      {price.discountPercent > 0 && (
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-accent">
          {t('checkout.discount', { percent: isolate(format.count(price.discountPercent)) })}
        </span>
      )}
    </label>
  );
}

function Checkout({ prices }: { prices: PlusPrice[] }) {
  const { t } = useI18n();
  const format = useFormatters();
  const checkout = useCheckout();
  const [months, setMonths] = useState(1);
  const name = useId();
  const totalId = useId();
  const chosen = prices.find((p) => p.months === months) ?? prices[0];
  if (!chosen) return null;

  return (
    <>
      <fieldset className={cardClass}>
        <legend className="sr-only">{t('checkout.length')}</legend>
        <p aria-hidden="true" className="text-xl font-bold">
          {t('checkout.length')}
        </p>
        <div className="flex flex-col gap-2">
          {prices.map((price) => (
            <PriceChoice
              key={price.months}
              price={price}
              name={name}
              checked={price.months === chosen.months}
              onChoose={() => setMonths(price.months)}
            />
          ))}
        </div>
      </fieldset>
      <section aria-labelledby={totalId} className={cardClass}>
        <h2 id={totalId} className="text-sm text-foreground-muted">
          {t('checkout.total')}
        </h2>
        <p className="text-2xl font-bold tabular-nums">{format.money(money(chosen.amount, IRR))}</p>
        {chosen.discountPercent > 0 && (
          <p className="flex gap-2 text-sm text-foreground-muted">
            <span className="sr-only">{t('checkout.fullPrice')}</span>
            <s className="tabular-nums">{format.money(money(chosen.fullAmount, IRR))}</s>
            <span className="text-accent">
              {t('checkout.discount', { percent: isolate(format.count(chosen.discountPercent)) })}
            </span>
          </p>
        )}
        <button
          type="button"
          disabled={checkout.isPending}
          onClick={() => checkout.mutate(chosen.months)}
          className="w-fit rounded-lg bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60"
        >
          {t('checkout.pay')}
        </button>
        {checkout.isError && (
          <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
            {t('checkout.failed')}
          </p>
        )}
      </section>
    </>
  );
}

/**
 * `/settings/subscription/checkout`: the User picks how many months of Plus to
 * buy at the server's prices and pays at Zarinpal, which sends them back to
 * the Subscription page. Every paywall leads here.
 */
export function CheckoutPage() {
  const { t } = useI18n();
  const subscription = useSubscription();
  const billingEnabled = subscription.data?.billingEnabled ?? false;
  const prices = usePlusPrices(billingEnabled);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('subscription.buy')}</h1>
      {subscription.isPending || (billingEnabled && prices.isPending) ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : subscription.isError || prices.isError ? (
        <p role="alert" className="text-danger">
          {t('checkout.loadFailed')}
        </p>
      ) : !billingEnabled || !prices.data ? (
        <p className="rounded-xl border border-border bg-surface px-6 py-5">
          {t('subscription.billingDisabled')}
        </p>
      ) : (
        <>
          <p className="text-foreground-muted">{t('checkout.intro')}</p>
          <Checkout prices={prices.data} />
        </>
      )}
    </div>
  );
}
