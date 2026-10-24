import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';
import { useUiLabels } from './UiProvider';

/**
 * What a section shows when it failed to load: says so, and offers to try again, so the User
 * recovers without reloading the app.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: {
  /** Defaults to the primitives' own "could not be loaded". */
  title?: string | undefined;
  description?: ReactNode;
  onRetry?: (() => void) | undefined;
  className?: string;
}) {
  const labels = useUiLabels();
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg bg-danger-subtle px-card py-section text-center',
        className,
      )}
    >
      <CircleAlert aria-hidden className="size-8 text-danger" />
      <p className="font-semibold">{title ?? labels.loadFailed}</p>
      {description && <p className="max-w-prose text-sm text-foreground-muted">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {labels.retry}
        </Button>
      )}
    </div>
  );
}
