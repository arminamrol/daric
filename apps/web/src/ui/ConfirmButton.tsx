import { useState } from 'react';

const secondaryClass =
  'rounded-md border border-border px-3 py-1 text-sm font-medium text-foreground disabled:opacity-60';
const dangerClass =
  'rounded-md border border-danger px-3 py-1 text-sm font-medium text-danger disabled:opacity-60';

/** A button for a step that cannot be undone: it asks once more, in place, before acting. */
export function ConfirmButton({
  label,
  ariaLabel,
  question,
  confirm,
  cancel,
  pending = false,
  onConfirm,
}: {
  label: string;
  ariaLabel?: string;
  question: string;
  confirm: string;
  cancel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setAsking(true)}
        className={secondaryClass}
      >
        {label}
      </button>
    );
  }
  return (
    <div role="group" className="flex flex-wrap items-center gap-2">
      <p className="text-sm">{question}</p>
      <button type="button" disabled={pending} onClick={onConfirm} className={dangerClass}>
        {confirm}
      </button>
      <button type="button" onClick={() => setAsking(false)} className={secondaryClass}>
        {cancel}
      </button>
    </div>
  );
}
