import { nativeTheme } from '@daric/design-tokens';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../ui/theme';

/** A share as a thin bar; the number beside it carries the value. */
export function ShareBar({ percent, color }: { percent: number; color: string }) {
  const { colors } = useTheme();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.track, { backgroundColor: colors.surfaceMuted }]}
    >
      <View
        style={[
          styles.fill,
          { width: `${Math.max(0, Math.min(percent, 100))}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: nativeTheme.radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: nativeTheme.radius.full },
});
