import { nativeTheme } from '@daric/design-tokens';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme';

/** A raised panel holding one part of a screen. */
export function Card({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

/** Rows on a raised panel, a rule between each. */
export function Rows({ children }: { children: readonly ReactNode[] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.rows, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children.map((child, i) => (
        <View key={i}>
          {i > 0 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
          {child}
        </View>
      ))}
    </View>
  );
}

/** A part's title, read out as a heading. */
export function Heading({ children, small = false }: { children: string; small?: boolean }) {
  return (
    <Text size={small ? 'base' : 'lg'} bold accessibilityRole="header">
      {children}
    </Text>
  );
}

/**
 * A figure with what it is, read out as one: `label` above `value`, or
 * beside it in a list of `inline` ones.
 */
export function Figure({
  label,
  value,
  note,
  large = false,
  inline = false,
}: {
  label: string;
  value: string;
  note?: string | undefined;
  large?: boolean;
  inline?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={[label, value, note].filter(Boolean).join('، ')}
      style={inline ? styles.inline : styles.figure}
    >
      <Text size="sm" tone="foregroundMuted" style={inline && styles.grow}>
        {label}
      </Text>
      <Text bold={large || inline} size={large ? '2xl' : 'base'} style={styles.number}>
        {value}
      </Text>
      {note && (
        <Text size="xs" tone="foregroundMuted">
          {note}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: nativeTheme.space(3),
    padding: nativeTheme.space(4),
    borderRadius: nativeTheme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rows: { borderRadius: nativeTheme.radius.lg, borderWidth: StyleSheet.hairlineWidth },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: nativeTheme.space(4) },
  figure: { gap: nativeTheme.space(0.5) },
  inline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: nativeTheme.space(3),
  },
  grow: { flex: 1 },
  number: { fontVariant: ['tabular-nums'] },
});
