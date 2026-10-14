import { nativeTheme } from '@daric/design-tokens';
import type { TextSize } from '@daric/design-tokens';
import { Text as NativeText } from 'react-native';
import type { TextProps } from 'react-native';
import { useI18n } from '../i18n/locale';
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
  // iOS aligns text by the phone's language unless told the direction of the app's.
  const { dir, font } = useI18n();
  return (
    <NativeText
      {...props}
      style={[
        nativeTheme.text[size],
        { fontFamily: bold ? font.bold : font.regular, color: colors[tone], writingDirection: dir },
        style,
      ]}
    />
  );
}
