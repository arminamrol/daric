import type { CSSProperties } from 'react';
import { Toaster as Sonner } from 'sonner';

export { toast } from 'sonner';

/** Short, non-blocking messages about what just happened; read out politely by screen readers. */
export function Toaster({ dir, label }: { dir: 'ltr' | 'rtl'; label: string }) {
  return (
    <Sonner
      dir={dir}
      // The colours come from the tokens below, so Sonner's own palette never shows.
      theme="light"
      position="bottom-center"
      containerAriaLabel={label}
      style={
        {
          '--normal-bg': 'var(--color-surface-raised)',
          '--normal-text': 'var(--color-foreground)',
          '--normal-border': 'var(--color-border-raised)',
          '--border-radius': 'var(--radius-md)',
        } as CSSProperties
      }
      toastOptions={{
        classNames: { toast: 'font-sans shadow-popover', description: 'text-foreground-muted' },
      }}
    />
  );
}
