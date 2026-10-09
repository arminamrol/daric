/** Raw Daric colors: coin gold and deep navy. UI code uses the semantic theme colors instead. */
export const palette = {
  white: '#ffffff',
  black: '#000000',
  gold: {
    50: '#fcf8ec',
    100: '#f7edcd',
    200: '#efd998',
    300: '#e5c163',
    400: '#d9a93c',
    500: '#c38f26',
    600: '#a1711c',
    700: '#7f5719',
    800: '#67461a',
    900: '#563b1a',
    950: '#311f0b',
  },
  navy: {
    50: '#f3f6fb',
    100: '#e4eaf4',
    200: '#c8d4e8',
    300: '#9db2d5',
    400: '#6b89bc',
    500: '#4a6aa3',
    600: '#385287',
    700: '#2e426d',
    800: '#27385a',
    900: '#152443',
    950: '#0a1328',
  },
} as const;

export type ThemeName = 'light' | 'dark';

export type SemanticColor =
  | 'background'
  | 'surface'
  | 'surfaceMuted'
  | 'foreground'
  | 'foregroundMuted'
  | 'border'
  | 'primary'
  | 'onPrimary'
  | 'accent'
  | 'focus'
  | 'danger'
  | 'success';

export type ThemeColors = Readonly<Record<SemanticColor, string>>;

const { gold, navy } = palette;

/** Semantic colors per theme; text pairs meet WCAG AA contrast (see tokens.test.ts). */
export const themes: Readonly<Record<ThemeName, ThemeColors>> = {
  light: {
    background: '#f8f7f3',
    surface: palette.white,
    surfaceMuted: navy[50],
    foreground: navy[950],
    foregroundMuted: navy[600],
    border: navy[100],
    primary: gold[500],
    onPrimary: navy[950],
    accent: gold[700],
    focus: gold[600],
    danger: '#b42318',
    success: '#067647',
  },
  dark: {
    background: navy[950],
    surface: navy[900],
    surfaceMuted: navy[800],
    foreground: '#f4f1e8',
    foregroundMuted: navy[300],
    border: navy[800],
    primary: gold[400],
    onPrimary: navy[950],
    accent: gold[300],
    focus: gold[300],
    danger: '#f97066',
    success: '#47cd89',
  },
};

/** Spacing grid step in pixels; spacing `n` is `n × spacingUnit`. */
export const spacingUnit = 4;

/** Corner radii in pixels. */
export const radius = { sm: 4, md: 8, lg: 12, xl: 16, full: 9999 } as const;

export type TextSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';

export const typography = {
  /** Self-hosted Vazirmatn first (covers Persian and Latin), then system fallbacks. */
  fontFamily: ['Vazirmatn', 'Tahoma', 'system-ui', 'sans-serif'],
  /** Font size and line height in pixels; Persian script gets generous leading. */
  size: {
    xs: { fontSize: 12, lineHeight: 20 },
    sm: { fontSize: 14, lineHeight: 22 },
    base: { fontSize: 16, lineHeight: 26 },
    lg: { fontSize: 18, lineHeight: 28 },
    xl: { fontSize: 20, lineHeight: 30 },
    '2xl': { fontSize: 24, lineHeight: 34 },
    '3xl': { fontSize: 30, lineHeight: 40 },
  } satisfies Record<TextSize, { fontSize: number; lineHeight: number }>,
  weight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
} as const;
