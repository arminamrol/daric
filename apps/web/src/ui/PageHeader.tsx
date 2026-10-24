import type { ReactNode } from 'react';
import { cn } from './cn';

/** A screen's title, with what it is for and its main actions at the end. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end gap-x-4 gap-y-3', className)}>
      <div className="me-auto flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="text-foreground-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
