import { ChevronDown } from 'lucide-react';
import { Label as LabelPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

/** Shared by every text-like control: tall enough to tap, red when invalid. */
const controlClass =
  'w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-base text-foreground transition-colors duration-(--daric-duration-fast) placeholder:text-foreground-muted disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger';

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('font-medium select-none', className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClass, 'min-h-touch', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlClass, 'min-h-24 py-2', className)} {...props} />;
}

/**
 * The browser's own select, styled: phones open their native picker, and long lists (timezones)
 * stay searchable by typing.
 */
export function NativeSelect({ className, dir, ...props }: ComponentProps<'select'>) {
  // The direction goes on the wrapper, so the chevron sits at the same end as the padding for it.
  return (
    <div dir={dir} className="relative">
      <select
        className={cn(controlClass, 'min-h-touch cursor-pointer appearance-none pe-10', className)}
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
      />
    </div>
  );
}

/** One labelled control with its hint and error, stacked. */
export function Field({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

export function FieldDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-foreground-muted', className)} {...props} />;
}

export function FieldError({ className, ...props }: ComponentProps<'p'>) {
  return <p role="alert" className={cn('text-sm text-danger', className)} {...props} />;
}

/** A group of fields that are enabled or disabled together. */
export function FieldSet({ className, ...props }: ComponentProps<'fieldset'>) {
  return <fieldset className={cn('flex min-w-0 flex-col gap-section', className)} {...props} />;
}

/** A message about a whole form: saved, or failed to save. */
export function FormMessage({
  tone,
  className,
  ...props
}: ComponentProps<'p'> & { tone: 'status' | 'alert' }) {
  return (
    <p
      role={tone}
      className={cn(
        'rounded-md px-3 py-2 text-sm',
        tone === 'alert'
          ? 'bg-danger-subtle text-danger'
          : 'bg-surface-muted text-foreground-muted',
        className,
      )}
      {...props}
    />
  );
}
