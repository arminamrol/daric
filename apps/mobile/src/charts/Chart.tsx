import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Text as SvgText } from 'react-native-svg';
import { useI18n } from '../i18n/locale';
import { FONT } from '../ui/fonts';
import { useTheme } from '../ui/theme';
import type { PlotBox, Tick } from './geometry';

/** Room above the plot for the highest tick's label. */
const INSET = 16;

/**
 * A chart drawn with react-native-svg as wide as its place: the marks `draw`
 * places in the box it is given, over grid lines at its ticks with their
 * values (`tickLabel`) written just above them. It is read out as one image
 * described by `summary`; the list of figures beside it carries the numbers.
 * A touch reports where across the chart it fell, for showing that point.
 */
export function Chart({
  height,
  summary,
  tickLabel,
  onTouch,
  draw,
}: {
  height: number;
  summary: string;
  tickLabel: (value: number) => string;
  onTouch?: ((x: number, box: PlotBox) => void) | undefined;
  draw: (box: PlotBox) => { ticks: readonly Tick[]; marks: ReactNode };
}) {
  const { colors } = useTheme();
  const { dir } = useI18n();
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
          {plot.ticks.map((tick) => (
            <SvgText
              key={`label-${tick.value}`}
              x={rtl ? width : 0}
              y={tick.y - 4}
              textAnchor={rtl ? 'end' : 'start'}
              fontFamily={FONT.regular}
              fontSize={11}
              fill={colors.foregroundMuted}
            >
              {tickLabel(tick.value)}
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
