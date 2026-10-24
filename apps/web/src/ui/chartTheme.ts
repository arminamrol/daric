import type { SemanticColor } from '@daric/design-tokens';

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** A token colour as the stylesheet gives it, so a chart follows the theme without redrawing. */
const color = (name: SemanticColor) => `var(--color-${kebab(name)})`;

/**
 * How every chart is drawn, from the tokens: soft grid, muted labels, the series colours and the
 * tooltip's box. Charts spread these into the chart library's props instead of choosing their own.
 */
export const chartTheme = {
  series: {
    income: color('chartIncome'),
    expense: color('chartExpense'),
    /** A single series, such as Net Worth over time. */
    total: color('accent'),
  },
  // The chart library only names physical sides; equal on both, so right-to-left needs nothing.
  margin: { top: 8, bottom: 8, left: 8, right: 8 },
  grid: { stroke: color('border'), vertical: false },
  xAxis: {
    tick: { fill: color('foregroundMuted'), fontSize: 12 },
    stroke: color('border'),
    tickLine: false,
  },
  yAxis: {
    tick: { fill: color('foregroundMuted'), fontSize: 12 },
    axisLine: false,
    tickLine: false,
    width: 112,
  },
  barCursor: { fill: color('surfaceMuted') },
  lineCursor: { stroke: color('foregroundMuted'), strokeDasharray: '4 4' },
  bar: { radius: [4, 4, 0, 0] as [number, number, number, number], maxBarSize: 24 },
  line: { type: 'monotone', strokeWidth: 2 } as const,
  dot: { r: 4, stroke: color('surface'), strokeWidth: 2 },
  activeDot: { r: 6, stroke: color('surface'), strokeWidth: 2 },
  tooltipClass:
    'rounded-md border border-border bg-surface-raised px-3 py-2 text-sm shadow-popover',
} as const;
