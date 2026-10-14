import { nativeTheme } from '@daric/design-tokens';
import { StyleSheet, View } from 'react-native';
import { useTheme } from './theme';

/** A bar `percent` full (capped at 100), read out as `label` with `valueText`. */
export function ProgressBar({
  percent,
  color,
  label,
  valueText,
}: {
  percent: number;
  color: string;
  label: string;
  valueText: string;
}) {
  const { colors } = useTheme();
  const filled = Math.max(0, Math.min(percent, 100));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: filled, text: valueText }}
      style={[styles.track, { backgroundColor: colors.surfaceMuted }]}
    >
      <View style={[styles.fill, { width: `${filled}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: nativeTheme.radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: nativeTheme.radius.full },
});
