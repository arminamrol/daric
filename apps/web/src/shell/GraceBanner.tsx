import { isolate } from '@daric/i18n';
import { Link } from 'react-router';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { useSubscription } from '../settings/subscription';
import { CHECKOUT_PATH } from '../ui/Paywall';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Shown on every page while the User's Plus has ended but its Grace Period
 * runs (ADR-0008): how many days Plus keeps working, what happens then, and
 * the way to renew. The server decides the Grace Period; this only counts
 * the days left to its end, a part of a day counting as one.
 */
export function GraceBanner() {
  const { t } = useI18n();
  const format = useFormatters();
  const { data: subscription } = useSubscription();
  if (!subscription?.billingEnabled || !subscription.inGracePeriod || !subscription.graceEndsAt) {
    return null;
  }
  const days = Math.max(
    1,
    Math.ceil((Date.parse(subscription.graceEndsAt) - new Date().getTime()) / DAY),
  );
  const renew = t('subscription.extend');

  return (
    <section
      aria-label={renew}
      className="mb-8 flex flex-col gap-2 rounded-lg border border-accent bg-surface-muted px-4 py-3"
    >
      <p className="text-sm">
        {days === 1
          ? t('grace.banner.day')
          : t('grace.banner.days', { days: isolate(format.count(days)) })}
      </p>
      <Link
        to={CHECKOUT_PATH}
        className="w-fit font-medium text-accent underline underline-offset-4"
      >
        {renew}
      </Link>
    </section>
  );
}
