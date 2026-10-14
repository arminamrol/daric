import type { Subscription } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useId } from 'react';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { useSubscription } from '../settings/subscription';

/** The Plan and how long it lasts; nothing to show when billing is disabled. */
function PlanCard({ subscription }: { subscription: Subscription }) {
  const { t } = useI18n();
  const format = useFormatters();
  const titleId = useId();
  const { plan, onTrial, expiresAt } = subscription;
  const until = expiresAt && isolate(format.date(new Date(expiresAt), { style: 'long' }));

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-6 py-5"
    >
      <h2 id={titleId} className="text-sm text-foreground-muted">
        {t('subscription.plan')}
      </h2>
      <p className="text-2xl font-bold">{t(`subscription.plan.${plan}`)}</p>
      {until && (
        <p className="text-sm text-foreground-muted">
          {plan === 'FREE'
            ? t('subscription.ended', { date: until })
            : onTrial
              ? t('subscription.trialUntil', { date: until })
              : t('subscription.plusUntil', { date: until })}
        </p>
      )}
    </section>
  );
}

function Entitlements({ subscription }: { subscription: Subscription }) {
  const { t } = useI18n();
  const format = useFormatters();
  const titleId = useId();
  const { signedInDevices, shareWorkspace, aiAnalysesPerMonth, aiAnalysesLeftThisMonth } =
    subscription.entitlements;
  const unlimited = t('subscription.unlimited');

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-6 py-5"
    >
      <h2 id={titleId} className="text-xl font-bold">
        {t('subscription.entitlements')}
      </h2>
      <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-2">
        <dt className="text-foreground-muted">{t('subscription.devices')}</dt>
        <dd className="font-medium tabular-nums">
          {signedInDevices === null ? unlimited : format.count(signedInDevices)}
        </dd>
        <dt className="text-foreground-muted">{t('subscription.sharing')}</dt>
        <dd className="font-medium">
          {t(shareWorkspace ? 'subscription.sharing.yes' : 'subscription.sharing.no')}
        </dd>
        <dt className="text-foreground-muted">{t('subscription.ai')}</dt>
        <dd className="font-medium tabular-nums">
          {aiAnalysesPerMonth === null || aiAnalysesLeftThisMonth === null
            ? unlimited
            : t('subscription.aiLeft', {
                left: isolate(format.count(aiAnalysesLeftThisMonth)),
                limit: isolate(format.count(aiAnalysesPerMonth)),
              })}
        </dd>
      </dl>
    </section>
  );
}

/** `/settings/subscription`: the User's own Plan, whichever Workspace they are in. */
export function SubscriptionPage() {
  const { t } = useI18n();
  const subscription = useSubscription();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('subscription.title')}</h1>
      {subscription.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : subscription.isError ? (
        <p role="alert" className="text-danger">
          {t('subscription.loadFailed')}
        </p>
      ) : (
        <>
          {subscription.data.billingEnabled ? (
            <PlanCard subscription={subscription.data} />
          ) : (
            <p className="rounded-xl border border-border bg-surface px-6 py-5">
              {t('subscription.billingDisabled')}
            </p>
          )}
          <Entitlements subscription={subscription.data} />
        </>
      )}
    </div>
  );
}
