import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';
import { cn } from './cn';

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

/**
 * A labelled row of mutually exclusive choices, one always picked. Arrow keys move and pick in
 * reading order, so in right-to-left the left arrow goes to the next choice. Its radios are
 * buttons, so a disabled `<fieldset>` greys them but Radix still needs `disabled` to skip them.
 */
export function SegmentedControl<T extends string>({
  legend,
  hideLegend = false,
  choices,
  value,
  onChange,
  describedBy,
  disabled,
  className,
}: {
  legend: string;
  hideLegend?: boolean;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  describedBy?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}) {
  const legendId = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span id={legendId} className={hideLegend ? 'sr-only' : 'font-medium'}>
        {legend}
      </span>
      <RadioGroupPrimitive.Root
        aria-labelledby={legendId}
        aria-describedby={describedBy}
        orientation="horizontal"
        value={value}
        // Radix reports any string; only our own choices can be picked.
        onValueChange={(next) => onChange(next as T)}
        {...(disabled === undefined ? {} : { disabled })}
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-surface-muted p-1 text-sm"
      >
        {choices.map((choice) => (
          <RadioGroupPrimitive.Item
            key={choice.value}
            value={choice.value}
            className="min-h-9 cursor-pointer rounded-sm px-3 text-foreground-muted transition-colors duration-(--daric-duration-fast) select-none hover:text-foreground disabled:cursor-not-allowed disabled:hover:text-foreground-muted data-[state=checked]:bg-primary data-[state=checked]:font-medium data-[state=checked]:text-on-primary"
          >
            {choice.label}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
