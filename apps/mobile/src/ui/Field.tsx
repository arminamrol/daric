import { nativeTheme } from '@daric/design-tokens';
import { forwardRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { FONT } from './fonts';
import { Text } from './Text';
import { useTheme } from './theme';

/** A labelled text field with an optional hint and error, both read out with it. */
export const Field = forwardRef<
  TextInput,
  TextInputProps & { label: string; hint?: string | undefined; error?: string | undefined }
>(function Field({ label, hint, error, style, ...props }, ref) {
  const { colors } = useTheme();
  const description = [hint, error].filter(Boolean).join('. ');
  return (
    <View style={styles.field}>
      <Text bold size="sm" importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={description || undefined}
        placeholderTextColor={colors.foregroundMuted}
        {...props}
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
          },
          style,
        ]}
      />
      {hint && (
        <Text size="sm" tone="foregroundMuted" importantForAccessibility="no">
          {hint}
        </Text>
      )}
      {error && (
        <Text size="sm" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: nativeTheme.space(1) },
  input: {
    ...nativeTheme.text.base,
    fontFamily: FONT.regular,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: nativeTheme.radius.md,
    paddingHorizontal: nativeTheme.space(3),
    paddingVertical: nativeTheme.space(2),
  },
});
