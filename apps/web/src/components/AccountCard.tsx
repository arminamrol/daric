import type { Account } from '@daric/core';
import { isolate } from '@daric/i18n';
import { Landmark, Wallet, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { balanceOf } from '../accounts/accounts';
import { ACCOUNT_CLASS_LABELS, ACCOUNT_TYPE_LABELS } from '../accounts/labels';
import { useI18n } from '../i18n/locale';
import { cn } from '../ui/cn';
import { Amount } from './Amount';

const CLASS_ICONS: Record<Account['class'], LucideIcon> = {
  ASSET: Wallet,
  LIABILITY: Landmark,
};

/**
 * An Account at a glance: its name, type, whether it is an Asset or a Liability (in words, not
 * only by icon) and its balance, big. With `href` its name links to it.
 */
export function AccountCard({
  account,
  href,
  className,
}: {
  account: Account;
  href?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const nameId = useId();
  const Icon = CLASS_ICONS[account.class];
  return (
    <article
      aria-labelledby={nameId}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-surface p-card shadow-card',
        account.archived && 'opacity-75',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-foreground-muted"
        >
          <Icon className="size-5" />
        </span>
        <div className="me-auto flex min-w-0 flex-col">
          <h3 className="truncate font-medium">
            {href ? (
              <Link
                to={href}
                aria-label={t('accounts.edit', { name: isolate(account.name) })}
                className="underline-offset-4 hover:underline"
              >
                <span id={nameId}>{account.name}</span>
              </Link>
            ) : (
              <span id={nameId}>{account.name}</span>
            )}
          </h3>
          <p className="text-sm text-foreground-muted">
            {t(ACCOUNT_TYPE_LABELS[account.type])}
            {' · '}
            {t(ACCOUNT_CLASS_LABELS[account.class])}
            {account.archived && ` · ${t('accounts.archived')}`}
          </p>
        </div>
      </div>
      <Amount value={balanceOf(account)} size="lg" />
    </article>
  );
}
