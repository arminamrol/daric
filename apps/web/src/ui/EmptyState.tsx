import type { ReactNode } from 'react';
import { CoinMotif } from './CoinMotif';
import { cn } from './cn';

/**
 * What an empty list or chart shows: what goes here, and the action that fills it. Leave the
 * action out for someone who may not add (a Member viewing a shared Workspace).
 */
export function EmptyState({
  title,
  description,
  action,
  level = 2,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** The heading level, one below the section the state sits in. */
  level?: 2 | 3;
  className?: string;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong/50 px-card py-section text-center',
        className,
      )}
    >
      <CoinMotif />
      <Heading className="text-lg font-semibold">{title}</Heading>
      {description && <p className="max-w-prose text-foreground-muted">{description}</p>}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
