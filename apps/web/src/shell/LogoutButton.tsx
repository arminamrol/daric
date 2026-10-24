import { LogOut } from 'lucide-react';
import { useLogout } from '../auth/logout';
import { useI18n } from '../i18n/locale';
import { cn } from '../ui/cn';

/** Logs out, named by its icon alone (`iconOnly`) or with the words beside it. */
export function LogoutButton({
  iconOnly = false,
  className,
}: {
  iconOnly?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const logout = useLogout();

  return (
    <button
      type="button"
      disabled={logout.isPending}
      onClick={() => logout.mutate()}
      title={iconOnly ? t('nav.logout') : undefined}
      className={cn(
        'flex min-h-touch cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-foreground-muted transition-colors duration-(--daric-duration-fast) hover:bg-surface-muted hover:text-foreground disabled:opacity-60',
        iconOnly && 'justify-center px-0',
        className,
      )}
    >
      <LogOut aria-hidden className="size-5 shrink-0 rtl:-scale-x-100" strokeWidth={1.9} />
      <span className={iconOnly ? 'sr-only' : undefined}>{t('nav.logout')}</span>
    </button>
  );
}
