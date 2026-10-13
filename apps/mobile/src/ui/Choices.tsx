import { nativeTheme } from '@daric/design-tokens';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme';

export interface Choice {
  readonly id: string;
  readonly label: string;
}

/** Pick one of a few, as chips that wrap; read out as a radio group. */
export function Choices({
  label,
  choices,
  selected,
  onSelect,
  error,
}: {
  label: string;
  choices: readonly Choice[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  error?: string | undefined;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      <Text bold size="sm" importantForAccessibility="no">
        {label}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
        {choices.map((choice) => {
          const on = choice.id === selected;
          return (
            <Pressable
              key={choice.id}
              accessibilityRole="radio"
              accessibilityLabel={choice.label}
              accessibilityState={{ selected: on, checked: on }}
              onPress={() => onSelect(choice.id)}
              style={[
                styles.chip,
                on
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text size="sm" bold={on} tone={on ? 'onPrimary' : 'foreground'}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error && (
        <Text size="sm" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: nativeTheme.space(1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: nativeTheme.space(2) },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: nativeTheme.space(3),
    borderRadius: nativeTheme.radius.full,
    borderWidth: 1,
  },
});
