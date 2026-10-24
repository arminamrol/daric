import { describe, expect, it } from 'vitest';
import { tailwindCss } from './index';

describe('tailwindCss', () => {
  // The committed preset is generated; refresh it with `pnpm --filter @daric/design-tokens generate`.
  it('matches the committed tailwind.css preset', async () => {
    await expect(tailwindCss()).toMatchFileSnapshot('../tailwind.css');
  });

  it('exposes semantic colors as utilities that follow the active theme', () => {
    const css = tailwindCss();
    expect(css).toContain('--color-background: var(--daric-background);');
    expect(css).toContain('--color-on-primary: var(--daric-on-primary);');
  });

  it('switches to dark colors by data-theme, or by system preference unless light is chosen', () => {
    const blocks = tailwindCss().split('\n\n');
    const blockWith = (text: string) => blocks.find((b) => b.includes(text)) ?? '';
    expect(blockWith(":root[data-theme='dark'] {")).toContain('--daric-background: #0a1328;');
    expect(blockWith('@media (prefers-color-scheme: dark)')).toContain(
      ":root:not([data-theme='light']) {",
    );
    expect(blockWith('@media (prefers-color-scheme: dark)')).toContain(
      '--daric-background: #0a1328;',
    );
  });

  it('sets type in Vazirmatn, or in Inter on a page in English', () => {
    const blocks = tailwindCss().split('\n\n');
    expect(blocks.find((b) => b.startsWith('@theme {'))).toContain(
      '--font-sans: Vazirmatn, Tahoma, system-ui, sans-serif;',
    );
    expect(blocks.find((b) => b.startsWith(':root:lang(en) {'))).toContain(
      '--font-sans: Inter, system-ui, sans-serif;',
    );
  });

  it('replaces Tailwind default colors with the Daric palette', () => {
    const css = tailwindCss();
    expect(css).toContain('--color-*: initial;');
    expect(css).toContain('--color-gold-500: #c38f26;');
    expect(css).toContain('--color-navy-950: #0a1328;');
  });

  it('gives each theme its shadows as utilities that follow the active theme', () => {
    const css = tailwindCss();
    const blocks = css.split('\n\n');
    const blockWith = (text: string) => blocks.find((b) => b.includes(text)) ?? '';
    expect(css).toContain('--shadow-card: var(--daric-shadow-card);');
    expect(css).toContain('--shadow-sheet: var(--daric-shadow-sheet);');
    expect(blockWith(":root[data-theme='dark'] {")).toMatch(/--daric-shadow-card: .* inset/);
    expect(blockWith(':root {')).toContain('--daric-shadow-card: 0 1px 2px');
  });

  it('adds the new semantic colors and subtle surfaces as utilities', () => {
    const css = tailwindCss();
    for (const name of ['surface-raised', 'border-strong', 'transfer', 'warning-subtle']) {
      expect(css).toContain(`--color-${name}: var(--daric-${name});`);
    }
  });

  it('exposes named spacing, display sizes and easings', () => {
    const theme = tailwindCss()
      .split('\n\n')
      .find((b) => b.startsWith('@theme {'));
    expect(theme).toContain('--spacing-gutter: 1rem;');
    expect(theme).toContain('--text-6xl: 3.75rem;');
    expect(theme).toContain('--text-6xl--line-height: 4.5rem;');
    expect(theme).toContain('--ease-standard: cubic-bezier(0.2, 0, 0, 1);');
    expect(theme).toContain('--radius-xl: 1.75rem;');
  });

  it('gives motion durations that drop to zero when the system asks for reduced motion', () => {
    const blocks = tailwindCss().split('\n\n');
    expect(blocks.find((b) => b.startsWith(':root {'))).toContain('--daric-duration-base: 200ms;');
    const reduced = blocks.find((b) => b.includes('prefers-reduced-motion: reduce')) ?? '';
    expect(reduced).toContain('--daric-duration-base: 0ms;');
  });
});
