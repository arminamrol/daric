import { nativeTheme } from '@daric/design-tokens';
import { StyleSheet, Switch, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme';

/** A labelled on/off switch with an optional hint, read out together. */
export function Toggle({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string | undefined;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text} importantForAccessibility="no-hide-descendants">
        <Text bold size="sm">
          {label}
        </Text>
        {hint && (
          <Text size="sm" tone="foregroundMuted">
            {hint}
          </Text>
        )}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: nativeTheme.space(3), minHeight: 48 },
  text: { flex: 1, gap: nativeTheme.space(0.5) },
});
