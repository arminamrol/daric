import { elevation, motion, radius, spacing, spacingUnit, themes, typography } from './tokens';
import type { TextSize } from './tokens';

type FontWeight = keyof typeof typography.weight;

/** Text style shaped like React Native's `TextStyle`, line height in absolute units. */
export interface NativeTextStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
}

const [fontFamily] = typography.fontFamily.fa;

const text = Object.fromEntries(
  Object.entries(typography.size).map(([size, { fontSize, lineHeight }]) => [
    size,
    { fontFamily, fontSize, lineHeight },
  ]),
) as Record<TextSize, NativeTextStyle>;

const fontWeight = Object.fromEntries(
  Object.entries(typography.weight).map(([name, weight]) => [name, String(weight)]),
) as Record<FontWeight, `${(typeof typography.weight)[FontWeight]}`>;

/**
 * Design tokens for the Expo app; sizes are density-independent pixels. Shadows are `boxShadow`
 * strings, durations milliseconds and easings the points for Reanimated's `Easing.bezier`.
 */
export const nativeTheme = {
  colors: themes,
  elevation,
  space: (n: number): number => n * spacingUnit,
  spacing,
  radius,
  motion,
  text,
  fontWeight,
} as const;
