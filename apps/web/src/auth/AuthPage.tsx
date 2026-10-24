import { CircleCheck, Info, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/locale';
import { Logo } from '../shell/Logo';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { cn } from '../ui/cn';
import { useMe } from './session';

/**
 * The frame of a page reached before or beside the app: sign-up, login, a mailed link, an
 * Invitation. A visitor sees the coin and the name above it; a signed-in User already has them in
 * the sidebar or top bar.
 */
export function AuthPage({
  title,
  titleId,
  description,
  footer,
  children,
}: {
  title: string;
  /** For a form inside to be named by the title. */
  titleId?: string;
  description?: ReactNode;
  /** Links under the card: to the other of login and sign-up, or back to login. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-section sm:py-4">
      <VisitorBrand />
      <Card className="gap-section">
        <header className="flex flex-col gap-1.5">
          <h1 id={titleId} className="text-2xl font-bold">
            {title}
          </h1>
          {description && <p className="text-foreground-muted">{description}</p>}
        </header>
        {children}
      </Card>
      {footer && (
        <div className="flex flex-col items-center gap-2 text-center text-sm text-foreground-muted">
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * The coin, the name and what Daric is for, shown to a visitor: their frame has no brand of its
 * own. Only once it is known nobody is signed in, so a signed-in User never sees it flash.
 */
export function VisitorBrand() {
  const { t } = useI18n();
  if (useMe().data !== null) return null;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Logo className="size-16 drop-shadow-sm" />
      <div className="flex flex-col">
        <p className="text-2xl font-bold">{t('app.name')}</p>
        <p className="text-sm text-foreground-muted">{t('app.tagline')}</p>
      </div>
    </div>
  );
}

const OUTCOME_ICONS = { done: CircleCheck, pending: LoaderCircle, info: Info } as const;

/** What happened, announced: a step done, one under way, or something to know. */
export function AuthOutcome({
  tone,
  children,
}: {
  tone: keyof typeof OUTCOME_ICONS;
  children: ReactNode;
}) {
  const Icon = OUTCOME_ICONS[tone];
  return (
    <div role="status" className="flex items-start gap-3 rounded-md bg-surface-muted px-4 py-3">
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-5 shrink-0',
          tone === 'done' && 'text-success',
          tone === 'pending' && 'animate-spin text-foreground-muted motion-reduce:animate-none',
          tone === 'info' && 'text-info',
        )}
      />
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </div>
  );
}

/** The form's one main action, full width, showing it is busy while the request is out. */
export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending && <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />}
      {children}
    </Button>
  );
}
