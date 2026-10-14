import { LogOut } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useLogout } from '../auth/logout';
import { useMe } from '../auth/session';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useI18n } from '../i18n/locale';
import { SyncStatus } from '../transactions/SyncStatus';
import { ThemeToggle } from '../theme/ThemeToggle';
import { Logo } from './Logo';
import { RecurringNavLink } from './RecurringNavLink';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1 text-sm ${isActive ? 'bg-surface-muted font-medium text-foreground' : 'text-foreground-muted hover:text-foreground'}`;

export function Shell() {
  const { t } = useI18n();
  const signedIn = Boolean(useMe().data);
  const logout = useLogout();

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
          {signedIn && <WorkspaceSwitcher />}
          {signedIn && (
            <nav aria-label={t('nav.label')} className="flex gap-1">
              <NavLink to="/" end className={navLinkClass}>
                {t('nav.home')}
              </NavLink>
              <NavLink to="/transactions" className={navLinkClass}>
                {t('nav.transactions')}
              </NavLink>
              <NavLink to="/accounts" className={navLinkClass}>
                {t('nav.accounts')}
              </NavLink>
              <NavLink to="/categories" className={navLinkClass}>
                {t('nav.categories')}
              </NavLink>
              <NavLink to="/labels" className={navLinkClass}>
                {t('nav.labels')}
              </NavLink>
              <NavLink to="/budgets" className={navLinkClass}>
                {t('nav.budgets')}
              </NavLink>
              <RecurringNavLink className={navLinkClass} />
              <NavLink to="/net-worth" className={navLinkClass}>
                {t('nav.netWorth')}
              </NavLink>
              <NavLink to="/projection" className={navLinkClass}>
                {t('nav.projection')}
              </NavLink>
              <NavLink to="/reports" className={navLinkClass}>
                {t('nav.reports')}
              </NavLink>
              <NavLink to="/rates" className={navLinkClass}>
                {t('nav.rates')}
              </NavLink>
              <NavLink to="/settings" className={navLinkClass}>
                {t('nav.settings')}
              </NavLink>
            </nav>
          )}
          {/* A signed-in User chooses it in Settings. */}
          {!signedIn && <LanguageToggle />}
          <ThemeToggle />
          {signedIn && (
            <button
              type="button"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
              aria-label={t('nav.logout')}
              title={t('nav.logout')}
              className="inline-flex size-9 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
            >
              <LogOut aria-hidden="true" className="size-5" strokeWidth={2} />
            </button>
          )}
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 outline-none"
      >
        {signedIn && <SyncStatus />}
        <Outlet />
      </main>
    </div>
  );
}
