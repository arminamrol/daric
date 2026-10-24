import type { ComponentProps } from 'react';
import { cn } from './cn';

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
