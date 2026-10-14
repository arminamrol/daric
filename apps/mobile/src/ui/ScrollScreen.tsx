import { nativeTheme } from '@daric/design-tokens';
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** A screen of parts one under another, pulled down to read it all again. */
export function ScrollScreen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + nativeTheme.space(6) },
      ]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: nativeTheme.space(5), padding: nativeTheme.space(4) },
});
