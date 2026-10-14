import { currencyByCode, money } from '@daric/core';
import type { NetWorthSnapshotSummary } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useState } from 'react';
import { Circle, Path } from 'react-native-svg';
import { Chart } from '../charts/Chart';
import { extremes, linePlot, nearest } from '../charts/geometry';
import { useFormatters, useShownInBase } from '../display/formatters';
import { useI18n } from '../i18n/locale';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

/**
 * The snapshots' totals over time as a line, read out as a summary of where
 * it went; a touch shows one snapshot's day and total, the last to start with.
 */
export function HistoryChart({
  snapshots,
  baseCurrency,
}: {
  /** Oldest first, all in `baseCurrency`. */
  snapshots: readonly NetWorthSnapshotSummary[];
  baseCurrency: string;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const format = useFormatters();
  // By id, so a new list never highlights a snapshot it does not hold.
  const [picked, setPicked] = useState<string>();
  const base = currencyByCode(baseCurrency);
  const inBase = useShownInBase(baseCurrency);
  const shown = (amount: bigint) => isolate(inBase(amount));
  const ends = extremes(snapshots, (s) => s.total);
  if (!ends) return null;

  const plot = (box: Parameters<typeof linePlot>[2]) =>
    linePlot(
      snapshots.map((s) => Date.parse(s.day)),
      snapshots.map((s) => Number(s.total)),
      box,
    );
  const found = snapshots.findIndex((s) => s.id === picked);
  const index = found === -1 ? snapshots.length - 1 : found;
  const current = snapshots[index] ?? ends.last;
  const summary = t('netWorth.chartSummary', {
    from: isolate(format.day(ends.first.day)),
    to: isolate(format.day(ends.last.day)),
    base: format.currency(base),
    first: shown(ends.first.total),
    last: shown(ends.last.total),
    lowest: shown(ends.lowest.total),
    lowestDay: isolate(format.day(ends.lowest.day)),
    highest: shown(ends.highest.total),
    highestDay: isolate(format.day(ends.highest.day)),
  });

  return (
    <>
      <Text
        size="sm"
        tone="foregroundMuted"
        importantForAccessibility="no"
        accessibilityElementsHidden
      >
        {`${format.day(current.day)} · ${t(`netWorth.kind.${current.kind}`)}: ${inBase(current.total)}`}
      </Text>
      <Chart
        height={200}
        summary={summary}
        tickLabel={(value) =>
          format.money(money(BigInt(Math.round(value)), base), { label: false })
        }
        span={{ from: format.day(ends.first.day), to: format.day(ends.last.day) }}
        onTouch={(x, box) =>
          setPicked(
            snapshots[
              nearest(
                plot(box).points.map((p) => p.x),
                x,
              )
            ]?.id,
          )
        }
        draw={(box) => {
          const { points, path, ticks } = plot(box);
          return {
            ticks,
            marks: (
              <>
                <Path d={path} stroke={colors.accent} strokeWidth={2} fill="none" />
                {points.map((p, i) => (
                  <Circle
                    key={snapshots[i]?.id ?? i}
                    cx={p.x}
                    cy={p.y}
                    r={i === index ? 6 : 4}
                    fill={colors.accent}
                    stroke={colors.surface}
                    strokeWidth={2}
                  />
                ))}
              </>
            ),
          };
        }}
      />
    </>
  );
}
