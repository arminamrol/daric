import { Link } from 'react-router';
import { useI18n } from '../i18n/locale';

/** Where every paywall leads. */
export const CHECKOUT_PATH = '/settings/subscription/checkout';

/**
 * Shown in place of an action the User's Plan does not include (ADR-0008):
 * what the Plus feature is, and a link to buy Plus. `cannotBuy` replaces the
 * link when buying would not help this User, e.g. when it is someone else's
 * Plan that counts; it says whom to ask instead.
 */
export function Paywall({
  title,
  body,
  cannotBuy,
}: {
  title: string;
  body: string;
  cannotBuy?: string | undefined;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent bg-surface-muted px-4 py-4">
      <p className="font-bold">{title}</p>
      <p className="text-sm">{body}</p>
      {cannotBuy === undefined ? (
        <Link
          to={CHECKOUT_PATH}
          className="w-fit font-medium text-accent underline underline-offset-4"
        >
          {t('subscription.buy')}
        </Link>
      ) : (
        <p className="text-sm text-foreground-muted">{cannotBuy}</p>
      )}
    </div>
  );
}
