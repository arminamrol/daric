import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';
import { useUiLabels } from './UiProvider';

/** A placeholder shaped like content still loading; hidden from screen readers. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

/** Skeletons for one section, announced once as loading. */
export function Loading({ children, className }: { children: ReactNode; className?: string }) {
  const { loading } = useUiLabels();
  return (
    <div role="status" aria-label={loading} className={cn('flex flex-col gap-3', className)}>
      {children}
    </div>
  );
}

/** A list still loading: a row per item, each with an icon, two lines and an amount. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Loading className="gap-0 divide-y divide-border rounded-lg border border-border bg-surface">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="me-auto flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </Loading>
  );
}

/** A stat or Account card still loading: a label and a big number. */
export function CardSkeleton() {
  return (
    <Loading className="rounded-lg border border-border bg-surface p-card shadow-card">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-40" />
    </Loading>
  );
}

/** A chart still loading: its title and a block its height. */
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <Loading>
      <Skeleton className="h-5 w-40" />
      <Skeleton className={cn('h-64 w-full rounded-lg', className)} />
    </Loading>
  );
}
