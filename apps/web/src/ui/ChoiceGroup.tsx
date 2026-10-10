import { useId } from 'react';

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** A segmented radio group: native radios keep arrow-key navigation and screen-reader roles. */
export function ChoiceGroup<T extends string>({
  legend,
  hideLegend = false,
  choices,
  value,
  onChange,
  describedBy,
}: {
  legend: string;
  hideLegend?: boolean;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  describedBy?: string | undefined;
}) {
  const name = useId();

  return (
    <fieldset aria-describedby={describedBy} className="flex flex-col gap-1">
      <legend className={hideLegend ? 'sr-only' : 'mb-1 font-medium'}>{legend}</legend>
      <div className="flex w-fit rounded-lg bg-surface-muted p-1 text-sm">
        {choices.map((choice) => (
          <label
            key={choice.value}
            className="cursor-pointer rounded-md px-3 py-1 text-foreground-muted transition-colors select-none hover:text-foreground has-checked:bg-primary has-checked:font-medium has-checked:text-on-primary has-disabled:cursor-not-allowed has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
          >
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              className="sr-only"
            />
            {choice.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
