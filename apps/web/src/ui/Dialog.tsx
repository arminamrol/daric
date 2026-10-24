import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';
import { modalClass, overlayClass } from './overlay';
import { useUiLabels } from './UiProvider';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** A modal window centred on the page; focus stays inside until it closes. */
export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  const { close } = useUiLabels();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content className={cn(modalClass, 'max-w-lg', className)} {...props}>
        {children}
        <CloseButton label={close} />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** The corner close button of a dialog or sheet. */
export function CloseButton({ label }: { label: string }) {
  return (
    <DialogPrimitive.Close
      aria-label={label}
      className="absolute end-3 top-3 grid size-touch cursor-pointer place-items-center rounded-md text-foreground-muted transition-colors duration-(--daric-duration-fast) hover:bg-surface-muted hover:text-foreground"
    >
      <X aria-hidden className="size-5" />
    </DialogPrimitive.Close>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 pe-10', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-foreground-muted', className)}
      {...props}
    />
  );
}
