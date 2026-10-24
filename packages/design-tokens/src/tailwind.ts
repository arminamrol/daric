import {
  elevation,
  motion,
  palette,
  radius,
  spacing,
  spacingUnit,
  themes,
  typography,
} from './tokens';
import type { ThemeName } from './tokens';

const rem = (px: number) => `${px / 16}rem`;
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
// Declarations wider than Prettier's print width put their value on the next line, as Prettier
// does, so the committed preset stays formatted.
const declaration = (line: string, indent: string) => {
  const wide = `${indent}${line}`.length > 100;
  return wide ? line.replace(': ', `:\n${indent}  `) : line;
};
const cssRule = (selector: string, lines: readonly string[], indent = '') =>
  [
    `${indent}${selector} {`,
    ...lines.map((l) => `${indent}  ${declaration(l, `${indent}  `)}`),
    `${indent}}`,
  ].join('\n');

const paletteVariables = (name: 'gold' | 'navy') =>
  Object.entries(palette[name]).map(([step, hex]) => `--color-${name}-${step}: ${hex};`);

const themeVariables = (scheme: ThemeName) => [
  `color-scheme: ${scheme};`,
  ...Object.entries(themes[scheme]).map(([name, hex]) => `--daric-${kebab(name)}: ${hex};`),
  ...Object.entries(elevation[scheme]).map(
    ([name, shadow]) => `--daric-shadow-${name}: ${shadow};`,
  ),
];

const durationVariables = (reducedMotion: boolean) =>
  Object.entries(motion.duration).map(
    ([name, ms]) => `--daric-duration-${name}: ${reducedMotion ? 0 : ms}ms;`,
  );

/**
 * The Tailwind v4 preset: a stylesheet imported after `tailwindcss`. Palette, type scale, spacing,
 * radii and easings become theme variables; semantic colors (`bg-surface`, `text-foreground`, …)
 * and shadows (`shadow-card`, …) read CSS variables that switch with `data-theme` on `<html>`, or
 * with the system preference when `data-theme` is absent. Motion durations are plain variables
 * (`duration-(--daric-duration-base)`) that drop to zero when the system asks for reduced motion.
 */
export function tailwindCss(): string {
  const theme = [
    '--color-*: initial;',
    `--color-white: ${palette.white};`,
    `--color-black: ${palette.black};`,
    ...paletteVariables('gold'),
    ...paletteVariables('navy'),
    `--font-sans: ${typography.fontFamily.fa.join(', ')};`,
    `--spacing: ${rem(spacingUnit)};`,
    ...Object.entries(spacing).map(([name, px]) => `--spacing-${kebab(name)}: ${rem(px)};`),
    ...Object.entries(typography.size).flatMap(([size, { fontSize, lineHeight }]) => [
      `--text-${size}: ${rem(fontSize)};`,
      `--text-${size}--line-height: ${rem(lineHeight)};`,
    ]),
    ...Object.entries(typography.weight).map(
      ([name, weight]) => `--font-weight-${name}: ${weight};`,
    ),
    // Tailwind's own `rounded-full` covers `radius.full`.
    ...Object.entries(radius)
      .filter(([name]) => name !== 'full')
      .map(([name, px]) => `--radius-${name}: ${rem(px)};`),
    ...Object.entries(motion.easing).map(
      ([name, points]) => `--ease-${name}: cubic-bezier(${points.join(', ')});`,
    ),
  ];
  const semantic = [
    ...Object.keys(themes.light).map(
      (name) => `--color-${kebab(name)}: var(--daric-${kebab(name)});`,
    ),
    ...Object.keys(elevation.light).map((name) => `--shadow-${name}: var(--daric-shadow-${name});`),
  ];
  return (
    [
      '/* Generated from src/tokens.ts by `pnpm --filter @daric/design-tokens generate`; do not edit. */',
      cssRule('@theme', theme),
      cssRule('@theme inline', semantic),
      cssRule(':root', [...themeVariables('light'), ...durationVariables(false)]),
      cssRule(':root:lang(en)', [`--font-sans: ${typography.fontFamily.en.join(', ')};`]),
      cssRule(":root[data-theme='dark']", themeVariables('dark')),
      [
        '@media (prefers-color-scheme: dark) {',
        cssRule(":root:not([data-theme='light'])", themeVariables('dark'), '  '),
        '}',
      ].join('\n'),
      [
        '@media (prefers-reduced-motion: reduce) {',
        cssRule(':root', durationVariables(true), '  '),
        '}',
      ].join('\n'),
    ].join('\n\n') + '\n'
  );
}
