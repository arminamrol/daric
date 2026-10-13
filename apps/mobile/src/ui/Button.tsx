import { nativeTheme } from '@daric/design-tokens';
import { Pressable, StyleSheet } from 'react-native';
import type { PressableProps } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme';

/** A labelled button; `primary` for the one main action of a screen. */
export function Button({
  label,
  primary = false,
  disabled,
  ...props
}: Omit<PressableProps, 'children'> & { label: string; primary?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      {...props}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: colors.primary }
          : { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text bold={primary} tone={primary ? 'onPrimary' : 'foreground'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nativeTheme.space(4),
    borderRadius: nativeTheme.radius.md,
  },
  dimmed: { opacity: 0.6 },
});
