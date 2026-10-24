import { Tag, X } from 'lucide-react';
import { cn } from '../ui/cn';

/**
 * A Label on a Transaction or in a filter. With `onRemove` it has a button that takes it off,
 * named by `removeLabel` (e.g. "Remove trip").
 */
export function LabelChip({
  name,
  onRemove,
  removeLabel,
  className,
}: {
  name: string;
  className?: string;
} & (
  { onRemove: () => void; removeLabel: string } | { onRemove?: undefined; removeLabel?: undefined }
)) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full bg-surface-muted ps-2 text-xs text-foreground',
        onRemove ? 'pe-0.5' : 'pe-2 py-0.5',
        className,
      )}
    >
      <Tag aria-hidden className="size-3 shrink-0 text-foreground-muted" />
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="grid size-6 cursor-pointer place-items-center rounded-full text-foreground-muted hover:bg-border hover:text-foreground"
        >
          <X aria-hidden className="size-3" />
        </button>
      )}
    </span>
  );
}
