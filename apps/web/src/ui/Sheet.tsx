import { cva } from 'class-variance-authority';
import { Dialog as SheetPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';
import { CloseButton } from './Dialog';
import { overlayClass } from './overlay';
import { useUiLabels } from './UiProvider';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

const sheetVariants = cva(
  'fixed z-50 flex flex-col gap-stack overflow-y-auto border-border-raised bg-surface-raised p-section text-foreground shadow-sheet ease-enter data-[state=closed]:animate-out data-[state=closed]:duration-(--daric-duration-base) data-[state=open]:animate-in data-[state=open]:duration-(--daric-duration-slow)',
  {
    variants: {
      side: {
        // Start and end follow the writing direction: in Persian, start is the right edge.
        start:
          'inset-y-0 start-0 h-full w-3/4 max-w-sm border-e data-[state=closed]:slide-out-to-start data-[state=open]:slide-in-from-start',
        end: 'inset-y-0 end-0 h-full w-3/4 max-w-sm border-s data-[state=closed]:slide-out-to-end data-[state=open]:slide-in-from-end',
        bottom:
          'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-xl border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
      },
    },
    defaultVariants: { side: 'end' },
  },
);

/** A panel that slides in from an edge: full forms on phones, side panels on wide screens. */
export function SheetContent({
  side = 'end',
  className,
  children,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & { side?: 'start' | 'end' | 'bottom' }) {
  const { close } = useUiLabels();
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className={overlayClass} />
      <SheetPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        <CloseButton label={close} />
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 pe-10', className)} {...props} />;
}

export function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-auto flex flex-col gap-2', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn('text-sm text-foreground-muted', className)}
      {...props}
    />
  );
}
