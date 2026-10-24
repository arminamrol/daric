import { NavLink } from 'react-router';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { cn } from '../ui/cn';
import type { Section } from './sections';
import { tabClass } from './tabClass';

/**
 * A link to a section with its icon: a row in a list, or a tab of the phone's tab bar (`look`).
 * `waiting` adds a count badge (Due Occurrences); `iconOnly` hides the name visually but keeps
 * it as the link's name.
 */
export function SectionLink({
  section,
  look = 'row',
  waiting = 0,
  iconOnly = false,
  onNavigate,
}: {
  section: Section;
  look?: 'row' | 'tab';
  waiting?: number;
  iconOnly?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const { icon: Icon } = section;

  return (
    <NavLink
      to={section.to}
      end={section.end ?? false}
      onClick={onNavigate}
      title={iconOnly ? t(section.label) : undefined}
      className={({ isActive }) =>
        look === 'tab'
          ? tabClass(isActive)
          : cn(
              'relative flex min-h-touch items-center gap-3 rounded-md px-3 text-sm transition-colors duration-(--daric-duration-fast) ease-standard',
              iconOnly && 'justify-center px-0',
              isActive
                ? 'bg-primary-subtle font-medium text-accent'
                : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
            )
      }
    >
      <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.9} />
      <span className={iconOnly ? 'sr-only' : look === 'row' ? 'me-auto' : undefined}>
        {t(section.label)}
      </span>
      <DueBadge
        count={waiting}
        className={iconOnly || look === 'tab' ? 'absolute end-1 top-1' : undefined}
      />
    </NavLink>
  );
}

/** How many Due Occurrences wait: a count to see, and a sentence for screen readers. */
export function DueBadge({ count, className }: { count: number; className?: string | undefined }) {
  const { t } = useI18n();
  const format = useFormatters();
  if (count === 0) return null;
  return (
    <>
      <span
        aria-hidden
        className={cn(
          'rounded-full bg-primary px-1.5 text-xs font-medium text-on-primary tabular-nums',
          className,
        )}
      >
        {format.count(count)}
      </span>
      <span className="sr-only"> {t('nav.dueCount', { count: format.count(count) })}</span>
    </>
  );
}
