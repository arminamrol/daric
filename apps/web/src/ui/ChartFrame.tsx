import type { ReactNode } from 'react';
import { useId } from 'react';
import { cn } from './cn';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { ChartSkeleton } from './Skeleton';

export interface LegendItem {
  label: string;
  /** A `chartTheme` colour. */
  color: string;
  /** Series differ in shape too, so colour is never the only way to tell them apart. */
  shape?: 'circle' | 'square' | 'line';
}

const SWATCH = {
  circle: 'size-2.5 rounded-full',
  square: 'size-2.5 rounded-sm',
  line: 'h-0.5 w-4 rounded-full',
} as const;

export function ChartLegend({ items }: { items: readonly LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {items.map(({ label, color, shape = 'circle' }) => (
        <li key={label} className="flex items-center gap-2">
          <span aria-hidden className={SWATCH[shape]} style={{ background: color }} />
          {label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Everything around a chart: its title, legend and a text summary that says what the drawing
 * shows (the drawing itself is hidden from screen readers), and its loading, empty and error
 * states in the chart's place.
 */
export function ChartFrame({
  title,
  summary,
  legend,
  status = 'ready',
  empty,
  onRetry,
  level = 2,
  actions,
  className,
  children,
}: {
  title: string;
  /** One or two sentences a screen reader reads instead of the drawing; shown to everyone. */
  summary: ReactNode;
  legend?: readonly LegendItem[];
  status?: 'ready' | 'loading' | 'empty' | 'error';
  /** What the empty state says, and the action that fills the chart. */
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
  onRetry?: () => void;
  level?: 2 | 3;
  /** Controls at the title's end, such as a Period switcher. */
  actions?: ReactNode;
  className?: string;
  /** The drawing. */
  children: ReactNode;
}) {
  const titleId = useId();
  const Heading = level === 2 ? 'h2' : 'h3';
  let body: ReactNode;
  if (status === 'loading') body = <ChartSkeleton />;
  else if (status === 'error') body = <ErrorState onRetry={onRetry} />;
  else if (status === 'empty') body = empty && <EmptyState level={3} {...empty} />;
  else
    body = (
      <>
        {legend && <ChartLegend items={legend} />}
        <div aria-hidden className="w-full">
          {children}
        </div>
        <p className="text-sm text-foreground-muted">{summary}</p>
      </>
    );

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'flex flex-col gap-stack rounded-lg border border-border bg-surface p-card shadow-card',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Heading id={titleId} className="me-auto text-lg font-semibold">
          {title}
        </Heading>
        {actions}
      </div>
      {body}
    </section>
  );
}
