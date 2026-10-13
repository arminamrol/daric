import { nativeTheme } from '@daric/design-tokens';
import type { TextSize } from '@daric/design-tokens';
import { Text as NativeText } from 'react-native';
import type { TextProps } from 'react-native';
import { FONT } from './fonts';
import { useTheme } from './theme';

/** Text in the app's font and theme colors. */
export function Text({
  size = 'base',
  bold = false,
  tone = 'foreground',
  style,
  ...props
}: TextProps & {
  size?: TextSize;
  bold?: boolean;
  tone?: 'foreground' | 'foregroundMuted' | 'danger' | 'success' | 'onPrimary';
}) {
  const { colors } = useTheme();
  return (
    <NativeText
      {...props}
      style={[
        nativeTheme.text[size],
        { fontFamily: bold ? FONT.bold : FONT.regular, color: colors[tone] },
        style,
      ]}
    />
  );
}
