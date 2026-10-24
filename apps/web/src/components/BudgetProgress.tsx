import type { BudgetProgress as Progress, BudgetState } from '@daric/core';
import { isolate } from '@daric/i18n';
import type { PlainMessageKey } from '@daric/i18n';
import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useI18n } from '../i18n/locale';

/** Each state has its own words and icon, so color is never the only sign. */
const STATES: Record<
  BudgetState,
  { label: PlainMessageKey; icon: LucideIcon; tone: string; bar: string }
> = {
  ok: { label: 'budgets.state.ok', icon: CircleCheck, tone: 'text-success', bar: 'bg-success' },
  warning: {
    label: 'budgets.state.warning',
    icon: TriangleAlert,
    tone: 'text-warning',
    bar: 'bg-warning',
  },
  over: { label: 'budgets.state.over', icon: CircleAlert, tone: 'text-danger', bar: 'bg-danger' },
};

/**
 * How far a Budget's Period has gone into its limit: a bar that fills up to the limit, the spent
 * and limit amounts, and the state (fine, near, over) in words and icon as well as colour.
 */
export function BudgetProgress({
  progress,
  spent,
  limit,
  labelledBy,
}: {
  progress: Progress;
  /** The amounts, formatted. */
  spent: string;
  limit: string;
  /** The id of the Budget's name. */
  labelledBy: string;
}) {
  const { t } = useI18n();
  const state = STATES[progress.state];
  const StateIcon = state.icon;
  const filled = Math.min(progress.percent, 100);
  return (
    <>
      <div
        role="progressbar"
        aria-labelledby={labelledBy}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={filled}
        aria-valuetext={t('budgets.progress', {
          spent: isolate(spent),
          limit: isolate(limit),
          state: t(state.label),
        })}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={`h-full rounded-full transition-[inline-size] duration-(--daric-duration-slow) ease-standard ${state.bar}`}
          style={{ inlineSize: `${filled}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="me-auto tabular-nums">
          {t('budgets.spentOf', { spent: isolate(spent), limit: isolate(limit) })}
        </span>
        <span className={`inline-flex items-center gap-1 font-medium ${state.tone}`}>
          <StateIcon aria-hidden="true" className="size-4" strokeWidth={2} />
          {t(state.label)}
        </span>
      </div>
    </>
  );
}
