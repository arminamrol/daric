import type { Money } from '@daric/core';
import { ArrowLeftRight } from 'lucide-react';
import { useFormatters } from '../settings/settings';
import { cn } from '../ui/cn';

export type AmountKind = 'income' | 'expense' | 'transfer';

const KINDS = {
  income: { sign: '+', tone: 'text-income' },
  expense: { sign: '−', tone: 'text-foreground' },
  transfer: { sign: '', tone: 'text-transfer' },
} as const;

const SIZES = {
  sm: 'text-sm font-medium',
  md: 'text-base font-medium',
  lg: 'text-2xl font-semibold',
  xl: 'text-4xl font-bold tracking-tight',
} as const;

/**
 * Money as Daric shows it everywhere: formatted for the User, in tabular digits so columns line
 * up. Income, Expense and Transfer differ in more than colour: Income carries `+`, Expense `−` and
 * a Transfer, which is neither, an arrows icon and no sign. Without a kind, only a negative amount
 * (an overdrawn balance) gets a sign.
 */
export function Amount({
  value,
  kind,
  size = 'md',
  label = true,
  className,
}: {
  value: Money;
  kind?: AmountKind | undefined;
  size?: keyof typeof SIZES;
  /** Show the currency's name; leave it out where a heading already says it. */
  label?: boolean;
  className?: string;
}) {
  const format = useFormatters();
  const negative = value.amount < 0n;
  const magnitude = { ...value, amount: negative ? -value.amount : value.amount };
  const sign = kind ? KINDS[kind].sign : negative ? '−' : '';
  return (
    <bdi
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap tabular-nums',
        SIZES[size],
        kind && KINDS[kind].tone,
        className,
      )}
    >
      {kind === 'transfer' && <ArrowLeftRight aria-hidden className="size-[0.9em] shrink-0" />}
      {sign}
      {format.money(magnitude, { label })}
    </bdi>
  );
}
