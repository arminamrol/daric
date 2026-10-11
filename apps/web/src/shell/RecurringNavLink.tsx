import { NavLink, type NavLinkProps } from 'react-router';
import { useI18n } from '../i18n/locale';
import { useDueOccurrences } from '../recurring/recurring';
import { useFormatters } from '../settings/settings';

/**
 * The header link to Recurring Rules, with how many Due Occurrences wait.
 * Asking for them on every page also records those of auto-posting rules as
 * soon as the app opens.
 */
export function RecurringNavLink({
  className,
}: {
  className: NonNullable<NavLinkProps['className']>;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const waiting = useDueOccurrences().data?.occurrences.length ?? 0;

  return (
    <NavLink to="/recurring" className={className}>
      {t('nav.recurring')}
      {waiting > 0 && (
        <>
          <span
            aria-hidden="true"
            className="ms-1 rounded-full bg-primary px-1.5 text-xs font-medium text-on-primary"
          >
            {format.count(waiting)}
          </span>
          <span className="sr-only"> {t('nav.dueCount', { count: format.count(waiting) })}</span>
        </>
      )}
    </NavLink>
  );
}
