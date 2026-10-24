import { type FormEvent, type ReactNode, useId, useRef, useState } from 'react';
import { Button } from './Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Dialog';
import { Field, FieldError, Input, Label } from './Field';
import { useUiLabels } from './UiProvider';

/**
 * A step that needs the password typed again before it happens: deleting the account, or any
 * change in the Back Office. Extra fields (a reason) go in `children` and arrive in the form data.
 *
 * `onConfirm` acts; when it resolves the dialog closes, when it rejects the dialog stays open with
 * `errorMessage(error)` under the password, so a typo costs nothing. Cancel forgets what was typed.
 */
export function PasswordConfirmDialog({
  trigger,
  title,
  description,
  confirm,
  tone = 'danger',
  children,
  onConfirm,
  errorMessage,
}: {
  /** The button that opens the dialog. */
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  /** The confirm button's words, naming the step ("Delete account"). */
  confirm: string;
  /** `primary` for a step that is not destructive (granting time). */
  tone?: 'danger' | 'primary';
  children?: ReactNode;
  onConfirm: (password: string, form: FormData) => Promise<unknown>;
  errorMessage: (error: unknown) => string;
}) {
  const labels = useUiLabels();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordId = useId();
  const errorId = useId();

  function onOpenChange(next: boolean) {
    // Once sent, the answer decides; closing would hide whether it happened.
    if (pending) return;
    setOpen(next);
    if (!next) {
      setPassword('');
      setError(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await onConfirm(password, form);
      setOpen(false);
      setPassword('');
    } catch (failure) {
      setError(errorMessage(failure));
      passwordRef.current?.select();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Without a description, say so, or Radix warns that one is missing. */}
      <DialogContent {...(description ? {} : { 'aria-describedby': undefined })}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          {children}
          <Field>
            <Label htmlFor={passwordId}>{labels.password}</Label>
            <Input
              ref={passwordRef}
              id={passwordId}
              name="password"
              type="password"
              dir="ltr"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error && <FieldError id={errorId}>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              {labels.cancel}
            </Button>
            <Button type="submit" variant={tone} disabled={!password || pending}>
              {confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
