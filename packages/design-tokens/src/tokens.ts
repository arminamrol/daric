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

/**
 * Category colors, the same in both themes: a Category's icon is drawn in white
 * on its color, so each must keep white readable (see tokens.test.ts).
 */
export const categoryPalette = {
  red: '#b91c1c',
  orange: '#c2410c',
  amber: '#b45309',
  green: '#15803d',
  teal: '#0f766e',
  sky: '#0369a1',
  blue: '#1d4ed8',
  indigo: '#4338ca',
  violet: '#6d28d9',
  pink: '#be185d',
  brown: '#8a5a2b',
  slate: '#475569',
} as const;

export type ThemeName = 'light' | 'dark';

export type SemanticColor =
  | 'background'
  | 'surface'
  | 'surfaceMuted'
  /** Popovers and sheets: a step lighter than `surface` in dark, where shadows barely show. */
  | 'surfaceRaised'
  | 'foreground'
  | 'foregroundMuted'
  /** Dividers and the edge of flat surfaces and cards. */
  | 'border'
  /** The edge of popovers and sheets on `surfaceRaised`. */
  | 'borderRaised'
  /** Input and control borders, visible at 3:1. */
  | 'borderStrong'
  /** Gold: only for the primary action, the active state and highlights. */
  | 'primary'
  | 'onPrimary'
  | 'primarySubtle'
  | 'accent'
  | 'focus'
  | 'danger'
  | 'dangerSubtle'
  | 'success'
  | 'warning'
  | 'warningSubtle'
  | 'info'
  | 'infoSubtle'
  /** Money in: amounts shown with "+". */
  | 'income'
  | 'incomeSubtle'
  /** Money moved between Accounts: never mistaken for Income or Expense. */
  | 'transfer'
  | 'transferSubtle'
  /** Chart marks for Income and Expense, told apart under color-vision deficiencies. */
  | 'chartIncome'
  | 'chartExpense';

export type ThemeColors = Readonly<Record<SemanticColor, string>>;

const { gold, navy } = palette;

/**
 * Semantic colors per theme, each theme designed rather than inverted; text pairs meet WCAG AA
 * contrast (see tokens.test.ts). A `…Subtle` color is a tinted surface for its role's text.
 */
export const themes: Readonly<Record<ThemeName, ThemeColors>> = {
  light: {
    background: '#f5f6f8',
    surface: palette.white,
    surfaceMuted: '#eef1f6',
    surfaceRaised: palette.white,
    foreground: navy[950],
    foregroundMuted: '#46587a',
    border: '#e3e8f0',
    borderRaised: '#dde3ec',
    borderStrong: '#7489ad',
    primary: gold[500],
    onPrimary: navy[950],
    primarySubtle: gold[50],
    accent: gold[700],
    focus: gold[600],
    danger: '#b42318',
    dangerSubtle: '#f8e9e8',
    success: '#067647',
    warning: '#b54708',
    warningSubtle: '#f8ede6',
    info: '#0b6aa2',
    infoSubtle: '#e7f0f6',
    income: '#067647',
    incomeSubtle: '#e6f1ed',
    transfer: '#5a45c7',
    transferSubtle: '#efecf9',
    chartIncome: '#067647',
    chartExpense: navy[500],
  },
  dark: {
    background: navy[950],
    surface: '#111d36',
    surfaceMuted: '#18284a',
    surfaceRaised: '#1a2b4d',
    foreground: '#f4f1e8',
    foregroundMuted: navy[300],
    border: '#1f3053',
    borderRaised: '#2a3d63',
    borderStrong: '#5b77a8',
    primary: gold[400],
    onPrimary: navy[950],
    primarySubtle: '#2a2410',
    accent: gold[300],
    focus: gold[300],
    danger: '#f97066',
    dangerSubtle: '#31293d',
    success: '#47cd89',
    warning: '#f5b046',
    warningSubtle: '#313238',
    info: '#6cc3f5',
    infoSubtle: '#1e3451',
    income: '#47cd89',
    incomeSubtle: '#193642',
    transfer: '#ada1ff',
    transferSubtle: '#272f52',
    chartIncome: '#2fbf71',
    chartExpense: '#7d9bd0',
  },
};

export type Elevation = 'card' | 'popover' | 'sheet';

/**
 * Shadows (CSS `box-shadow`, also React Native's `boxShadow`) per elevation level. Cards sit on
 * `surface` with `border`; popovers and sheets on `surfaceRaised` with `borderRaised`. Dark adds
 * an inner top highlight, because shadows barely show on navy.
 */
export const elevation: Readonly<Record<ThemeName, Readonly<Record<Elevation, string>>>> = {
  light: {
    card: '0 1px 2px rgb(10 19 40 / 0.06), 0 1px 1px rgb(10 19 40 / 0.04)',
    popover: '0 4px 12px -2px rgb(10 19 40 / 0.08), 0 2px 4px rgb(10 19 40 / 0.04)',
    sheet: '0 16px 40px -8px rgb(10 19 40 / 0.18), 0 4px 10px rgb(10 19 40 / 0.06)',
  },
  dark: {
    card: '0 1px 0 rgb(255 255 255 / 0.04) inset, 0 1px 2px rgb(0 0 0 / 0.4)',
    popover: '0 1px 0 rgb(255 255 255 / 0.05) inset, 0 6px 16px -4px rgb(0 0 0 / 0.5)',
    sheet: '0 1px 0 rgb(255 255 255 / 0.06) inset, 0 20px 44px -10px rgb(0 0 0 / 0.65)',
  },
};

/** Spacing grid step in pixels; spacing `n` is `n × spacingUnit`. */
export const spacingUnit = 4;

/** Named spacing in pixels, all on the 4-point grid. */
export const spacing = {
  /** Space between a screen's edge and its content on a phone. */
  gutter: 16,
  /** The same on wider screens. */
  gutterWide: 32,
  /** Padding inside a card. */
  card: 16,
  /** Gap between items in a stack, such as rows in a card. */
  stack: 12,
  /** Gap between sections of a screen. */
  section: 24,
  /** Smallest touch target edge. */
  touch: 44,
} as const;

/** Corner radii in pixels: chips `full`, inputs and buttons `md`, cards `lg`, sheets `xl`. */
export const radius = { sm: 6, md: 12, lg: 18, xl: 28, full: 9999 } as const;

/** A cubic-bézier curve as its two control points: `[x1, y1, x2, y2]`. */
export type Easing = readonly [number, number, number, number];

/**
 * Motion durations in milliseconds and easings. `emphasis` is for a balance counting up or a
 * chart drawing in; everything drops to no motion when the system asks for reduced motion.
 */
export const motion = {
  duration: { fast: 120, base: 200, slow: 320, emphasis: 600 },
  easing: {
    /** Moving or resizing something already on screen. */
    standard: [0.2, 0, 0, 1],
    /** Something arriving: a sheet, a dialog, a menu. */
    enter: [0, 0, 0, 1],
    /** Something leaving. */
    exit: [0.3, 0, 1, 1],
  } satisfies Record<string, Easing>,
} as const;

export type TextSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';

export const typography = {
  /**
   * Self-hosted fonts first, then system fallbacks, per language: Vazirmatn
   * (which covers Latin too) for Persian, Inter for English.
   */
  fontFamily: {
    fa: ['Vazirmatn', 'Tahoma', 'system-ui', 'sans-serif'],
    en: ['Inter', 'system-ui', 'sans-serif'],
  },
  /**
   * Font size and line height in pixels; Persian script gets generous leading. `4xl` to `6xl`
   * are display sizes for balances, set bold.
   */
  size: {
    xs: { fontSize: 12, lineHeight: 20 },
    sm: { fontSize: 14, lineHeight: 22 },
    base: { fontSize: 16, lineHeight: 26 },
    lg: { fontSize: 18, lineHeight: 28 },
    xl: { fontSize: 20, lineHeight: 30 },
    '2xl': { fontSize: 24, lineHeight: 34 },
    '3xl': { fontSize: 30, lineHeight: 40 },
    '4xl': { fontSize: 36, lineHeight: 48 },
    '5xl': { fontSize: 48, lineHeight: 60 },
    '6xl': { fontSize: 60, lineHeight: 72 },
  } satisfies Record<TextSize, { fontSize: number; lineHeight: number }>,
  weight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
} as const;
