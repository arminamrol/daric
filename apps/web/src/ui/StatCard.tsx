import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId } from 'react';
import { cn } from './cn';

/** One figure that answers at a glance (Net Worth, this Period's Expense), with its name. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  /** The figure itself, usually an `Amount`. */
  value: ReactNode;
  /** A line under the figure: a change, a comparison, a date. */
  hint?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const labelId = useId();
  return (
    <section
      aria-labelledby={labelId}
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-border bg-surface p-card shadow-card',
        className,
      )}
    >
      <h2 id={labelId} className="flex items-center gap-2 text-sm text-foreground-muted">
        {Icon && <Icon aria-hidden className="size-4" />}
        {label}
      </h2>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      {hint && <p className="text-sm text-foreground-muted">{hint}</p>}
    </section>
  );
}
