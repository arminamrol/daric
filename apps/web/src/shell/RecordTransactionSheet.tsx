import { useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/locale';
import { RecordTransaction } from '../transactions/RecordTransaction';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../ui/Sheet';

/**
 * Records a Transaction in a sheet over the current page: from the bottom on a phone, from the
 * side on a wide screen. It stays open after each one, ready for the next. `children` is the
 * one button that opens it.
 */
export function RecordTransactionSheet({
  side,
  children,
}: {
  side: 'bottom' | 'end';
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side={side}
        aria-describedby={undefined}
        className={side === 'end' ? 'max-w-md sm:w-full' : 'h-[90dvh]'}
      >
        {/* The form has the same heading; this one names the sheet. */}
        <SheetTitle className="sr-only">{t('transactions.form.title')}</SheetTitle>
        <RecordTransaction onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
