import { Outlet } from 'react-router';
import { useMe } from '../auth/session';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useI18n } from '../i18n/locale';
import { ThemeToggle } from '../theme/ThemeToggle';
import { SyncStatus } from '../transactions/SyncStatus';
import { cn } from '../ui/cn';
import { GraceBanner } from './GraceBanner';
import { Logo } from './Logo';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { useWideScreen } from './useWideScreen';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

/**
 * The frame around every page: a sidebar on a wide screen, a top bar and bottom tab bar on a
 * phone, and only the name, language and theme for a visitor who is not signed in. Until it is
 * known who is here, the page (its own loading notice) goes without a frame.
 *
 * The page keeps its place in the tree whichever frame is around it, so signing in, the session
 * arriving or the screen turning never mounts it again (a mailed link's page reads its token once).
 */
export function Shell() {
  const { t } = useI18n();
  const me = useMe();
  const wide = useWideScreen();
  const signedIn = Boolean(me.data);
  const frame = me.isPending ? 'none' : !signedIn ? 'guest' : wide ? 'sidebar' : 'tabs';

  return (
    <div className={cn('flex min-h-dvh', frame === 'sidebar' ? 'flex-row' : 'flex-col')}>
      <a
        href="#main"
        className="sr-only rounded-md bg-surface px-4 py-2 font-medium text-foreground shadow-popover focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50"
      >
        {t('shell.skipToContent')}
      </a>
      {frame === 'guest' && <GuestHeader />}
      {frame === 'sidebar' && <Sidebar />}
      {frame === 'tabs' && <PhoneHeader />}
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          'w-full min-w-0 flex-1 outline-none',
          frame === 'sidebar' ? 'px-gutter-wide py-12' : 'px-gutter',
          // Room at the bottom, so the tab bar never covers the end of a page.
          frame === 'tabs' ? 'pt-6 pb-28' : 'py-12',
        )}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col">
          {/* Whether this device's changes reached the server, and the Grace Period: above every page. */}
          {signedIn && <SyncStatus />}
          {signedIn && <GraceBanner />}
          <Outlet />
        </div>
      </main>
      {frame === 'tabs' && <TabBar />}
    </div>
  );
}

function GuestHeader() {
  const { t } = useI18n();
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-gutter py-3">
        <Logo className="size-10 shrink-0" />
        <div className="me-auto">
          <p className="text-lg leading-tight font-bold">{t('app.name')}</p>
          <p className="text-xs text-foreground-muted">{t('app.tagline')}</p>
        </div>
        {/* A signed-in User chooses it in Settings. */}
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}

/** A phone's top bar: the name, and the Workspace switcher within thumb's reach of the top. */
function PhoneHeader() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-gutter py-2">
        <Logo className="size-8 shrink-0" />
        <p className="me-auto text-lg font-bold">{t('app.name')}</p>
        <WorkspaceSwitcher hideLabel />
      </div>
    </header>
  );
}
