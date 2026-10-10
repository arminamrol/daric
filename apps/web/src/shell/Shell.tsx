import { NavLink, Outlet } from 'react-router';
import { useMe } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { ThemeToggle } from '../theme/ThemeToggle';
import { Logo } from './Logo';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1 text-sm ${isActive ? 'bg-surface-muted font-medium text-foreground' : 'text-foreground-muted hover:text-foreground'}`;

export function Shell() {
  const { t } = useI18n();
  const signedIn = Boolean(useMe().data);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-md bg-surface px-4 py-2 font-medium text-foreground shadow-md focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-10"
      >
        {t('shell.skipToContent')}
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <Logo className="size-10 shrink-0" />
          <div className="me-auto">
            <p className="text-lg leading-tight font-bold">{t('app.name')}</p>
            <p className="text-xs text-foreground-muted">{t('app.tagline')}</p>
          </div>
          {signedIn && (
            <nav aria-label={t('nav.label')} className="flex gap-1">
              <NavLink to="/" end className={navLinkClass}>
                {t('nav.home')}
              </NavLink>
              <NavLink to="/settings" className={navLinkClass}>
                {t('nav.settings')}
              </NavLink>
            </nav>
          )}
          <ThemeToggle />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 outline-none"
      >
        <Outlet />
      </main>
    </div>
  );
}
