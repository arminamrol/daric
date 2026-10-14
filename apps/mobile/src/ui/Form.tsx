import { nativeTheme } from '@daric/design-tokens';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme';

/** A screen of fields that scrolls and keeps the focused field above the keyboard. */
export function FormScroll({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** What went wrong with a save, or that it worked, said at once. */
export function FormMessage({
  message,
  tone = 'danger',
}: {
  message: string | undefined;
  tone?: 'danger' | 'success';
}) {
  if (!message) return null;
  return (
    <Text
      tone={tone}
      accessibilityRole="alert"
      accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
    >
      {message}
    </Text>
  );
}

/** A part of a form set apart by a rule above it, e.g. archiving. */
export function FormSection({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.section, { borderColor: colors.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { gap: nativeTheme.space(4), padding: nativeTheme.space(4) },
  section: {
    gap: nativeTheme.space(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: nativeTheme.space(4),
  },
});
