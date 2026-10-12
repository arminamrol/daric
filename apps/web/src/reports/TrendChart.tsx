import { currencyByCode, money, periodParam } from '@daric/core';
import type { Report } from '@daric/core';
import { isolate } from '@daric/i18n';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';

type TrendPoint = Report['trend'][number];

interface Point {
  key: string;
  income: number;
  expense: number;
  point: TrendPoint;
}

const SERIES = [
  { key: 'income', color: 'var(--color-chart-income)' },
  { key: 'expense', color: 'var(--color-chart-expense)' },
] as const;

function ChartTooltip({
  active,
  payload,
  baseCurrency,
}: TooltipContentProps<ValueType, NameType> & { baseCurrency: string }) {
  const { t } = useI18n();
  const format = useFormatters();
  const data = active ? (payload[0]?.payload as Point | undefined) : undefined;
  if (!data) return null;
  const base = currencyByCode(baseCurrency);
  const { point } = data;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm">
      <p className="text-foreground-muted">{format.period(point.month)}</p>
      {SERIES.map(({ key, color }) => (
        <p key={key} className="flex items-center gap-2 tabular-nums">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: color }} />
          {t(`reports.${key}`)}: {format.money(money(point[key], base))}
        </p>
      ))}
      <p className="tabular-nums">
        {t('reports.net')}: {format.money(money(point.net, base))}
      </p>
    </div>
  );
}

/**
 * Each month's Income and Expense side by side, loaded on its own as Recharts
 * is large; drawn only, the table beside it carries the numbers.
 */
export default function TrendChart({
  trend,
  baseCurrency,
}: {
  trend: Report['trend'];
  baseCurrency: string;
}) {
  const { t, dir } = useI18n();
  const format = useFormatters();
  const base = currencyByCode(baseCurrency);
  // A number only sizes the bar; every figure shown comes from the bigint.
  const points: Point[] = trend.map((point) => ({
    key: periodParam(point.month),
    income: Number(point.income),
    expense: Number(point.expense),
    point,
  }));
  const label = (key: string) => {
    const point = points.find((p) => p.key === key)?.point;
    return point ? format.period(point.month) : '';
  };
  const first = trend[0];
  const last = trend[trend.length - 1];
  const rtl = dir === 'rtl';

  return (
    <div
      role="img"
      aria-label={t('reports.trendChart', {
        from: isolate(first ? format.period(first.month) : ''),
        to: isolate(last ? format.period(last.month) : ''),
        base: format.currency(base),
      })}
      className="h-72 w-full"
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 600, height: 288 }}
      >
        <BarChart
          data={points}
          margin={{ top: 8, bottom: 8, left: 8, right: 8 }}
          barGap={2}
          // The table beside the chart is the keyboard and screen-reader view.
          accessibilityLayer={false}
        >
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="key"
            reversed={rtl}
            tickFormatter={label}
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
            content={(props) => <ChartTooltip {...props} baseCurrency={baseCurrency} />}
            cursor={{ fill: 'var(--color-surface-muted)' }}
          />
          <Legend
            formatter={(key: string) => (
              <span className="text-sm text-foreground">{t(`reports.${key as 'income'}`)}</span>
            )}
          />
          {SERIES.map(({ key, color }) => (
            <Bar
              key={key}
              dataKey={key}
              fill={color}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
