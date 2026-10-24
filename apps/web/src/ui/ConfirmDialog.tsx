import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './AlertDialog';
import { Button } from './Button';

/**
 * A button for a step that cannot be undone: it asks in a dialog first, and acts only on the
 * explicit answer. Cancel, Escape and the backdrop all leave things as they were.
 */
export function ConfirmDialog({
  label,
  ariaLabel,
  question,
  confirm,
  cancel,
  pending = false,
  onConfirm,
}: {
  label: string;
  ariaLabel?: string | undefined;
  question: string;
  confirm: string;
  cancel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={ariaLabel} disabled={pending}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent aria-describedby={undefined}>
        <AlertDialogTitle>{question}</AlertDialogTitle>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
