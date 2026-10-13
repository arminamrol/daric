import { nativeTheme } from '@daric/design-tokens';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme';

/** A full screen in the theme's background. */
export function Screen({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>{children}</View>;
}

/** A screen saying something is loading, or what went wrong. */
export function Status({ message, alert = false }: { message: string; alert?: boolean }) {
  const { colors } = useTheme();
  return (
    <Screen>
      <View style={styles.center} accessibilityLiveRegion="polite">
        {!alert && <ActivityIndicator color={colors.primary} accessibilityLabel={message} />}
        <Text
          tone={alert ? 'danger' : 'foregroundMuted'}
          accessibilityRole={alert ? 'alert' : 'text'}
        >
          {message}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: nativeTheme.space(3),
    padding: nativeTheme.space(6),
  },
});
