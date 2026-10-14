import type { SyncState } from '@daric/api-client';
import { nativeTheme } from '@daric/design-tokens';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n/locale';
import { SYNC_LABELS, SyncMark } from './SyncMark';
import { Text } from './Text';

/**
 * One item of a list, read out as one: its title, the lines under it, what
 * shows at its end and whether a change of it is not sent yet. With
 * `onPress`, it is a button (e.g. to edit it).
 */
export function ListRow({
  title,
  lines = [],
  trailing,
  leading,
  state,
  onPress,
  actionLabel,
  children,
}: {
  title: string;
  lines?: readonly (string | false | null | undefined)[];
  trailing?: string | undefined;
  leading?: ReactNode;
  state?: SyncState | undefined;
  onPress?: (() => void) | undefined;
  /** What pressing does, e.g. "Edit Melli"; read in place of the title. */
  actionLabel?: string | undefined;
  /** More controls at the end, each reachable on its own. */
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const shownLines = lines.filter((line): line is string => Boolean(line));
  const label = [actionLabel ?? title, trailing, ...shownLines, state && t(SYNC_LABELS[state])]
    .filter(Boolean)
    .join(t('list.separator'));
  const content = (
    <>
      {leading}
      <View style={styles.main}>
        <Text bold>{title}</Text>
        {shownLines.map((line) => (
          <Text key={line} size="sm" tone="foregroundMuted">
            {line}
          </Text>
        ))}
        <SyncMark state={state} />
      </View>
      {trailing !== undefined && (
        <Text bold style={styles.trailing}>
          {trailing}
        </Text>
      )}
    </>
  );
  return (
    <View style={styles.row}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={({ pressed }) => [styles.content, pressed && styles.pressed]}
        >
          {content}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={label} style={styles.content}>
          {content}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: nativeTheme.space(4),
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeTheme.space(3),
    minHeight: 56,
    paddingVertical: nativeTheme.space(3),
  },
  pressed: { opacity: 0.6 },
  main: { flex: 1, gap: nativeTheme.space(0.5) },
  trailing: { fontVariant: ['tabular-nums'] },
});
