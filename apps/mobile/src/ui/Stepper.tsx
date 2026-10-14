import { nativeTheme } from '@daric/design-tokens';
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';

/**
 * A number moved up and down by `step` between `min` and `max`, with − and +
 * buttons. A screen reader finds one adjustable control named `label` and
 * reads `valueText`; swiping up or down moves it.
 */
export function Stepper({
  label,
  value,
  valueText,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  valueText: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const down = () => onChange(Math.max(min, value - step));
  const up = () => onChange(Math.min(max, value + step));
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? up() : down())}
      style={styles.row}
    >
      <Text bold size="sm" style={styles.grow}>
        {label}
      </Text>
      <Button label="−" disabled={value <= min} onPress={down} />
      <Text bold size="lg" style={styles.value}>
        {valueText}
      </Text>
      <Button label="+" disabled={value >= max} onPress={up} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: nativeTheme.space(2) },
  grow: { flex: 1 },
  value: { minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
