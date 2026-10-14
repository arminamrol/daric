import { nativeTheme } from '@daric/design-tokens';
import type { ReactNode } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { useTheme } from './theme';

export interface ListSection<T> {
  key: string;
  /** Read out as a heading; none for a list of one group. */
  title?: string;
  data: readonly T[];
}

/**
 * A screen-long list in sections, pulled down to refetch, with what goes
 * above it (filters, notices) and what it says when empty.
 */
export function ListScreen<T>({
  sections,
  keyOf,
  renderItem,
  header,
  empty,
  refreshing,
  onRefresh,
}: {
  sections: readonly ListSection<T>[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  header?: ReactNode;
  empty: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const shown = sections.filter((section) => section.data.length > 0);
  return (
    <SectionList
      sections={shown.map((section) => ({ ...section, data: [...section.data] }))}
      keyExtractor={keyOf}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={header ? <View style={styles.header}>{header}</View> : null}
      renderSectionHeader={({ section }) =>
        section.title ? (
          <View style={[styles.section, { backgroundColor: colors.background }]}>
            <Text size="lg" bold accessibilityRole="header">
              {section.title}
            </Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => <>{renderItem(item)}</>}
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
      )}
      ListEmptyComponent={
        <Text tone="foregroundMuted" style={styles.empty}>
          {empty}
        </Text>
      }
      contentContainerStyle={{ paddingBottom: insets.bottom + nativeTheme.space(6) }}
      stickySectionHeadersEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: nativeTheme.space(3), padding: nativeTheme.space(4) },
  section: { paddingHorizontal: nativeTheme.space(4), paddingVertical: nativeTheme.space(2) },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: nativeTheme.space(4) },
  empty: { textAlign: 'center', padding: nativeTheme.space(8) },
});
