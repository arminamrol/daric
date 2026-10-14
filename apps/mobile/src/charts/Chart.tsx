import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Text as SvgText } from 'react-native-svg';
import { useI18n } from '../i18n/locale';
import { useTheme } from '../ui/theme';
import type { PlotBox, Tick } from './geometry';

/** Room above the plot for the highest tick's label. */
const INSET = 16;

/**
 * A chart drawn with react-native-svg as wide as its place: the marks `draw`
 * places in the box it is given, over grid lines at its ticks with their
 * values (`tickLabel`) written just above them, haloed so they stay legible
 * over marks, and when the time runs from and to (`span`) under its ends. It is read out as one image
 * described by `summary`; the list of figures beside it carries the numbers.
 * A touch reports where across the chart it fell, for showing that point.
 */
export function Chart({
  height,
  summary,
  tickLabel,
  span,
  onTouch,
  draw,
}: {
  height: number;
  summary: string;
  tickLabel: (value: number) => string;
  /** The first and last time shown, written under the start and end of the plot. */
  span: { from: string; to: string };
  onTouch?: ((x: number, box: PlotBox) => void) | undefined;
  draw: (box: PlotBox) => { ticks: readonly Tick[]; marks: ReactNode };
}) {
  const { colors } = useTheme();
  const { dir, font } = useI18n();
  const [width, setWidth] = useState(0);
  const rtl = dir === 'rtl';
  const box: PlotBox = { width, height, inset: INSET, rtl };
  const plot = width > 0 ? draw(box) : undefined;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !!onTouch}
      onResponderGrant={(e) => onTouch?.(e.nativeEvent.locationX, box)}
      style={[styles.chart, { height }]}
    >
      {plot && (
        <Svg width={width} height={height}>
          {plot.ticks.map((tick) => (
            <Line
              key={`line-${tick.value}`}
              x1={0}
              x2={width}
              y1={tick.y}
              y2={tick.y}
              stroke={colors.border}
              strokeWidth={StyleSheet.hairlineWidth}
            />
          ))}
          {plot.marks}
          {plot.ticks.flatMap((tick) =>
            // A halo in the background color first, so a label stays legible over marks.
            (['halo', 'label'] as const).map((layer) => (
              <SvgText
                key={`${layer}-${tick.value}`}
                x={rtl ? width : 0}
                y={tick.y - 4}
                textAnchor={rtl ? 'end' : 'start'}
                fontFamily={font.regular}
                fontSize={11}
                fill={colors.foregroundMuted}
                {...(layer === 'halo' && { stroke: colors.surface, strokeWidth: 3 })}
              >
                {tickLabel(tick.value)}
              </SvgText>
            )),
          )}
          {/* The oldest time is at the start: the left, or the right when reading right to left. */}
          {(
            [
              [span.from, rtl ? width : 0, rtl ? 'end' : 'start'],
              [span.to, rtl ? 0 : width, rtl ? 'start' : 'end'],
            ] as const
          ).map(([text, x, anchor]) => (
            <SvgText
              key={`span-${anchor}`}
              x={x}
              y={height - 2}
              textAnchor={anchor}
              fontFamily={font.regular}
              fontSize={11}
              fill={colors.foregroundMuted}
            >
              {text}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { width: '100%' },
});
