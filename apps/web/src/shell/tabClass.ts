import { cn } from '../ui/cn';

/** A tab of the phone's tab bar: icon over its name, gold while current. */
export const tabClass = (active: boolean) =>
  cn(
    'relative flex min-h-touch flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md text-xs transition-colors duration-(--daric-duration-fast)',
    active ? 'font-medium text-accent' : 'text-foreground-muted hover:text-foreground',
  );
