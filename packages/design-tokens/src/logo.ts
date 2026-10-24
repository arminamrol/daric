import { palette, themes } from './tokens';
import type { ThemeName } from './tokens';
import { wordmarks } from './wordmarks';

export interface LogoColors {
  /** The coin. */
  readonly coin: string;
  /** The rim and the arrow struck into the coin. */
  readonly ink: string;
  /** The name beside the mark. */
  readonly name: string;
  /** Behind the mark on an app icon. */
  readonly tile: string;
}

/** The logo per theme: a lighter gold coin in dark, the same navy ink in both. */
export const logoColors: Readonly<Record<ThemeName, LogoColors>> = {
  light: {
    coin: themes.light.primary,
    ink: themes.light.onPrimary,
    name: themes.light.foreground,
    tile: palette.gold[50],
  },
  dark: {
    coin: themes.dark.primary,
    ink: themes.dark.onPrimary,
    name: themes.dark.foreground,
    tile: palette.navy[950],
  },
};

type Point = readonly [x: number, y: number];

const tip: Point = [50.5, 13.5];
const corners: readonly Point[] = [
  [23, 41],
  [27, 37],
];
const arm = 5;

/**
 * "Breaking rim" (DR-02) on a 64-unit grid: a gold coin with its struck rim, and the archer's arrow
 * rising from bottom-start to top-end, its head breaking the rim. The rim's edges fall on whole
 * pixels at 32px. The arrow keeps its direction in right-to-left: it is a mark, not an icon.
 */
export const logoMark = {
  size: 64,
  coin: { cx: 32, cy: 32, r: 30 },
  rim: { cx: 32, cy: 32, r: 23.5, strokeWidth: 3 },
  tip,
  /** The arrowhead, drawn with a slightly rounded outline. */
  head: `M${tip.join(' ')} L47 27 L37 17 Z`,
  headStrokeWidth: 1.5,
  /** Coin-colored margin around the arrowhead, cutting the rim where the head breaks it. */
  halo: 2.5,
  shaft: 'M22 42 L42 22',
  shaftWidth: 5,
  /** Two chevrons at the tail, each a corner on the shaft with an arm back and an arm down. */
  fletching: {
    corners,
    arm,
    strokeWidth: 2.5,
    paths: corners.map(([x, y]) => `M${x - arm} ${y} H${x} V${y + arm}`),
  },
} as const;

const { coin, rim, head, halo, fletching } = logoMark;

/** The mark's shapes in SVG, painted with the given colors (any SVG paint, e.g. `currentColor`). */
function markShapes(coinPaint: string, ink: string): string {
  return [
    `<circle cx="${coin.cx}" cy="${coin.cy}" r="${coin.r}" fill="${coinPaint}"/>`,
    `<circle cx="${rim.cx}" cy="${rim.cy}" r="${rim.r}" fill="none" stroke="${ink}" stroke-width="${rim.strokeWidth}"/>`,
    `<path d="${head}" fill="${coinPaint}" stroke="${coinPaint}" stroke-width="${halo * 2}" stroke-linejoin="round"/>`,
    `<path d="${logoMark.shaft}" stroke="${ink}" stroke-width="${logoMark.shaftWidth}" stroke-linecap="round"/>`,
    `<path d="${head}" fill="${ink}" stroke="${ink}" stroke-width="${logoMark.headStrokeWidth}" stroke-linejoin="round"/>`,
    `<g fill="none" stroke="${ink}" stroke-width="${fletching.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">`,
    ...fletching.paths.map((d) => `  <path d="${d}"/>`),
    '</g>',
  ].join('\n');
}

const indent = (lines: string) =>
  lines
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');

const round = (n: number) => Math.round(n * 100) / 100;

function svgDocument(
  width: number,
  height: number,
  title: string,
  body: string,
  lang?: string,
): string {
  const language = lang ? ` xml:lang="${lang}"` : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${height}" role="img"${language}>`,
    `  <title>${title}</title>`,
    indent(body),
    '</svg>',
    '',
  ].join('\n');
}

/** The mark scaled by `scale` about the canvas center, e.g. to sit on an app icon tile. */
function placedMark(colors: LogoColors, scale: number): string {
  const offset = round((logoMark.size * (1 - scale)) / 2);
  return [
    `<g transform="translate(${offset} ${offset}) scale(${scale})">`,
    indent(markShapes(colors.coin, colors.ink)),
    '</g>',
  ].join('\n');
}

/** Space between the mark and the name, in mark units (12px beside a 44px mark). */
const LOCKUP_GAP = 17.5;

/**
 * The mark with the name at its end, the mark at the start of the reading direction. The name's
 * ink is centered on the mark.
 */
function lockup(lang: 'fa' | 'en', colors: LogoColors): string {
  const {
    d,
    bounds: [xMin, yMin, xMax, yMax],
  } = wordmarks[lang];
  const nameWidth = xMax - xMin;
  const width = logoMark.size + LOCKUP_GAP + nameWidth;
  const markX = lang === 'fa' ? round(nameWidth + LOCKUP_GAP) : 0;
  const nameX = round((lang === 'fa' ? 0 : logoMark.size + LOCKUP_GAP) - xMin);
  const nameY = round(logoMark.size / 2 - (yMin + yMax) / 2);
  const body = [
    `<g transform="translate(${markX} 0)">`,
    indent(markShapes(colors.coin, colors.ink)),
    '</g>',
    `<path transform="translate(${nameX} ${nameY})" fill="${colors.name}" d="${d}"/>`,
  ].join('\n');
  return svgDocument(width, logoMark.size, lang === 'fa' ? 'دریک' : 'Daric', body, lang);
}

/** Share of an app icon tile the mark spans. */
const APP_ICON_SCALE = 0.72;
/** Share of an Android adaptive icon the mark spans, inside its 66/108 safe zone. */
const ADAPTIVE_ICON_SCALE = 0.58;

/** The favicon: the light mark, struck in the dark gold when the system is dark. */
function favicon(): string {
  const style = [
    '<style>',
    `  svg { color: ${logoColors.light.coin}; }`,
    `  @media (prefers-color-scheme: dark) { svg { color: ${logoColors.dark.coin}; } }`,
    '</style>',
  ].join('\n');
  return svgDocument(
    logoMark.size,
    logoMark.size,
    'Daric',
    `${style}\n${markShapes('currentColor', logoColors.light.ink)}`,
  );
}

/**
 * Every brand file by name: the mark, the lockups in Persian and English and the app icon, each in
 * light and dark; the Android adaptive-icon foreground; and the favicon. The app icons and favicon
 * are rasterized from these (see `scripts/rasterize.js`).
 */
export function brandFiles(): Record<string, string> {
  const files: Record<string, string> = { 'favicon.svg': favicon() };
  for (const theme of ['light', 'dark'] as const) {
    const colors = logoColors[theme];
    files[`mark-${theme}.svg`] = svgDocument(
      logoMark.size,
      logoMark.size,
      'Daric',
      markShapes(colors.coin, colors.ink),
    );
    files[`lockup-fa-${theme}.svg`] = lockup('fa', colors);
    files[`lockup-en-${theme}.svg`] = lockup('en', colors);
    files[`app-icon-${theme}.svg`] = svgDocument(
      logoMark.size,
      logoMark.size,
      'Daric',
      [
        `<rect width="${logoMark.size}" height="${logoMark.size}" fill="${colors.tile}"/>`,
        placedMark(colors, APP_ICON_SCALE),
      ].join('\n'),
    );
  }
  files['adaptive-icon.svg'] = svgDocument(
    logoMark.size,
    logoMark.size,
    'Daric',
    placedMark(logoColors.light, ADAPTIVE_ICON_SCALE),
  );
  return files;
}
