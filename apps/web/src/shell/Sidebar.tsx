import { Building2, PanelLeftClose, PanelLeftOpen, Plus, SunMoon } from 'lucide-react';
import { useId, useState } from 'react';
import { useMe } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { storedFlag } from '../lib/storedFlag';
import { ThemeToggle } from '../theme/ThemeToggle';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { Logo } from './Logo';
import { LogoutButton } from './LogoutButton';
import { RecordTransactionSheet } from './RecordTransactionSheet';
import { SectionLink } from './SectionLink';
import { BUDGETS, HOME, INSIGHTS, RECURRING, TRANSACTIONS, type Section } from './sections';
import { useShellNavigation } from './useShellNavigation';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

/** Remembered on this device: whether the User folded the sidebar down to its icons. */
const collapsedFlag = storedFlag('daric.sidebarCollapsed');

const iconButtonClass =
  'grid size-touch cursor-pointer place-items-center rounded-md text-foreground-muted transition-colors duration-(--daric-duration-fast) hover:bg-surface-muted hover:text-foreground';

/**
 * The wide-screen navigation: the Workspace switcher and recording a Transaction at the top,
 * every section below, Insights and More as named groups, then the theme and logging out. It
 * folds down to icons, each still named for screen readers and on hover.
 */
export function Sidebar() {
  const { t, dir } = useI18n();
  const { more, dueCount, canRecord } = useShellNavigation();
  // Popovers open away from the sidebar, which sits at the start edge.
  const outward = dir === 'rtl' ? 'left' : 'right';
  const [collapsed, setCollapsed] = useState(collapsedFlag.get);
  const workspaceCount = useMe().data?.workspaces.length ?? 0;
  const ids = { insights: useId(), more: useId() };

  function toggle() {
    collapsedFlag.set(!collapsed);
    setCollapsed(!collapsed);
  }

  const link = (section: Section) => (
    <li key={section.to}>
      <SectionLink
        section={section}
        iconOnly={collapsed}
        waiting={section.to === RECURRING.to ? dueCount : 0}
      />
    </li>
  );
  const group = (id: string, label: string, sections: readonly Section[]) => (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1">
      <p
        id={id}
        className={cn(
          'px-3 pt-3 text-xs font-medium text-foreground-muted',
          collapsed && 'sr-only',
        )}
      >
        {label}
      </p>
      {collapsed && <hr aria-hidden className="mx-2 border-border" />}
      <ul className="flex flex-col gap-1">{sections.map(link)}</ul>
    </div>
  );

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-dvh shrink-0 flex-col gap-4 overflow-y-auto border-e border-border bg-surface p-3 transition-[width] duration-(--daric-duration-base) ease-standard',
        collapsed ? 'w-20' : 'w-64',
      )}
    >
      <div className={cn('flex items-center gap-3 px-1 pt-1', collapsed && 'justify-center')}>
        <Logo className="size-9 shrink-0" />
        <p className={collapsed ? 'sr-only' : 'text-lg leading-tight font-bold'}>{t('app.name')}</p>
      </div>

      {workspaceCount > 1 &&
        (collapsed ? (
          <Popover>
            <PopoverTrigger
              aria-label={t('workspace.switch')}
              title={t('workspace.switch')}
              className={cn(iconButtonClass, 'mx-auto')}
            >
              <Building2 aria-hidden className="size-5" strokeWidth={1.9} />
            </PopoverTrigger>
            <PopoverContent side={outward} align="start">
              <WorkspaceSwitcher stacked />
            </PopoverContent>
          </Popover>
        ) : (
          <div className="px-1">
            <WorkspaceSwitcher stacked />
          </div>
        ))}

      {canRecord && (
        <RecordTransactionSheet side="end">
          <Button
            aria-label={collapsed ? t('transactions.form.title') : undefined}
            title={collapsed ? t('transactions.form.title') : undefined}
            className={collapsed ? 'mx-auto size-touch px-0' : 'w-full'}
          >
            <Plus aria-hidden strokeWidth={2.2} />
            {!collapsed && t('transactions.form.title')}
          </Button>
        </RecordTransactionSheet>
      )}

      <nav aria-label={t('nav.label')} className="flex flex-col gap-1">
        <ul className="flex flex-col gap-1">{[HOME, TRANSACTIONS, BUDGETS].map(link)}</ul>
        {group(ids.insights, t('nav.insights'), INSIGHTS)}
        {group(ids.more, t('nav.more'), more)}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
        {collapsed ? (
          <Popover>
            <PopoverTrigger
              aria-label={t('theme.title')}
              title={t('theme.title')}
              className={cn(iconButtonClass, 'mx-auto')}
            >
              <SunMoon aria-hidden className="size-5" strokeWidth={1.9} />
            </PopoverTrigger>
            <PopoverContent side={outward} align="end" className="w-fit">
              <ThemeToggle hideLegend={false} />
            </PopoverContent>
          </Popover>
        ) : (
          <ThemeToggle />
        )}
        <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
          <LogoutButton iconOnly={collapsed} className={collapsed ? 'size-touch' : 'me-auto'} />
          <button
            type="button"
            aria-label={t('nav.sidebar')}
            aria-expanded={!collapsed}
            title={t('nav.sidebar')}
            onClick={toggle}
            className={iconButtonClass}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden className="size-5 rtl:-scale-x-100" strokeWidth={1.9} />
            ) : (
              <PanelLeftClose aria-hidden className="size-5 rtl:-scale-x-100" strokeWidth={1.9} />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
