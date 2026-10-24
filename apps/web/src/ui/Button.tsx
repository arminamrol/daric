import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-(--daric-duration-fast) ease-standard select-none disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary/90',
        secondary: 'bg-surface-muted text-foreground hover:bg-border',
        outline:
          'border border-border-strong bg-transparent text-foreground hover:bg-surface-muted',
        ghost: 'text-foreground hover:bg-surface-muted',
        danger: 'bg-danger-subtle text-danger hover:bg-danger hover:text-surface',
        link: 'text-accent underline underline-offset-4 hover:no-underline',
      },
      size: {
        md: 'min-h-touch px-4 text-base',
        sm: 'min-h-9 px-3 text-sm',
        icon: 'size-touch',
      },
    },
    // A link reads as text: no touch-sized box around it, whatever the size.
    compoundVariants: [{ variant: 'link', class: 'min-h-0 px-0' }],
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Renders the one child (a link) with the button's look instead of a `<button>`. */
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
