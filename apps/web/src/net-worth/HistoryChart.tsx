import { currencyByCode, money } from '@daric/core';
import type { NetWorthSnapshotSummary } from '@daric/core';
import { isolate } from '@daric/i18n';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';

interface Point {
  /** The day, as milliseconds since the epoch, so the axis spaces snapshots by time. */
  x: number;
  total: number;
  snapshot: NetWorthSnapshotSummary;
}

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const { t } = useI18n();
  const format = useFormatters();
  const point = active ? (payload[0]?.payload as Point | undefined) : undefined;
  if (!point) return null;
  const { snapshot } = point;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm">
      <p className="text-foreground-muted">
        {format.day(snapshot.day)} · {t(`netWorth.kind.${snapshot.kind}`)}
      </p>
      <p className="font-medium tabular-nums">
        {format.money(money(snapshot.total, currencyByCode(snapshot.baseCurrency)))}
      </p>
    </div>
  );
}

/**
 * The snapshots' totals over time, loaded on its own as Recharts is large; drawn
 * only, the table beside it carries the numbers.
 */
export default function HistoryChart({
  snapshots,
  baseCurrency,
}: {
  snapshots: NetWorthSnapshotSummary[];
  baseCurrency: string;
}) {
  const { t, dir } = useI18n();
  const format = useFormatters();
  const base = currencyByCode(baseCurrency);
  // A number only places the point; every figure shown comes from the bigint.
  const points: Point[] = snapshots.map((snapshot) => ({
    x: Date.parse(snapshot.day),
    total: Number(snapshot.total),
    snapshot,
  }));
  const dayAt = (x: number) => format.day(new Date(x).toISOString().slice(0, 10));
  // Ticks on the month ends, or on every snapshot if there are only manual ones.
  const autos = points.filter((p) => p.snapshot.kind === 'AUTO');
  const ticks = (autos.length > 0 ? autos : points).map((p) => p.x);
  const first = points[0];
  const last = points[points.length - 1];
  const rtl = dir === 'rtl';

  return (
    <div
      role="img"
      aria-label={t('netWorth.chart', {
        from: isolate(first ? format.day(first.snapshot.day) : ''),
        to: isolate(last ? format.day(last.snapshot.day) : ''),
        base: format.currency(base),
      })}
      className="h-64 w-full"
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 600, height: 256 }}
      >
        <LineChart
          data={points}
          margin={{ top: 8, bottom: 8, left: 8, right: 8 }}
          // The table beside the chart is the keyboard and screen-reader view.
          accessibilityLayer={false}
        >
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={ticks}
            reversed={rtl}
            tickFormatter={dayAt}
            tick={{ fill: 'var(--color-foreground-muted)', fontSize: 12 }}
            stroke="var(--color-border)"
            tickLine={false}
          />
          <YAxis
            orientation={rtl ? 'right' : 'left'}
            width={112}
            tickFormatter={(value: number) =>
              format.money(money(BigInt(Math.round(value)), base), { label: false })
            }
            tick={{ fill: 'var(--color-foreground-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={ChartTooltip}
            cursor={{ stroke: 'var(--color-foreground-muted)', strokeDasharray: '4 4' }}
          />
          <Line
            dataKey="total"
            type="monotone"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={{
              r: 4,
              fill: 'var(--color-accent)',
              stroke: 'var(--color-surface)',
              strokeWidth: 2,
            }}
            activeDot={{ r: 6, stroke: 'var(--color-surface)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
