import { palette, radius, spacingUnit, themes, typography } from './tokens';
import type { ThemeColors } from './tokens';

const rem = (px: number) => `${px / 16}rem`;
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const block = (selector: string, lines: readonly string[], indent = '') =>
  [`${indent}${selector} {`, ...lines.map((l) => `${indent}  ${l}`), `${indent}}`].join('\n');

const scale = (name: 'gold' | 'navy') =>
  Object.entries(palette[name]).map(([step, hex]) => `--color-${name}-${step}: ${hex};`);

const themeVariables = (scheme: 'light' | 'dark', colors: ThemeColors) => [
  `color-scheme: ${scheme};`,
  ...Object.entries(colors).map(([name, hex]) => `--daric-${kebab(name)}: ${hex};`),
];

/**
 * The Tailwind v4 preset: a stylesheet imported after `tailwindcss`. Palette, type scale, spacing
 * and radii become theme variables; semantic colors (`bg-surface`, `text-foreground`, …) read
 * CSS variables that switch with `data-theme` on `<html>`, or with the system preference when
 * `data-theme` is absent.
 */
export function tailwindCss(): string {
  const theme = [
    '--color-*: initial;',
    `--color-white: ${palette.white};`,
    `--color-black: ${palette.black};`,
    ...scale('gold'),
    ...scale('navy'),
    `--font-sans: ${typography.fontFamily.join(', ')};`,
    `--spacing: ${rem(spacingUnit)};`,
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
  ];
  const semantic = Object.keys(themes.light).map(
    (name) => `--color-${kebab(name)}: var(--daric-${kebab(name)});`,
  );
  return (
    [
      '/* Generated from src/tokens.ts by `pnpm --filter @daric/design-tokens generate`; do not edit. */',
      block('@theme', theme),
      block('@theme inline', semantic),
      block(':root', themeVariables('light', themes.light)),
      block(":root[data-theme='dark']", themeVariables('dark', themes.dark)),
      [
        '@media (prefers-color-scheme: dark) {',
        block(":root:not([data-theme='light'])", themeVariables('dark', themes.dark), '  '),
        '}',
      ].join('\n'),
    ].join('\n\n') + '\n'
  );
}
