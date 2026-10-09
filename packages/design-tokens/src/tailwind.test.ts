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
    const dark = (selector: string) => blocks.find((b) => b.includes(selector)) ?? '';
    expect(dark(":root[data-theme='dark'] {")).toContain('--daric-background: #0a1328;');
    expect(dark('@media (prefers-color-scheme: dark)')).toContain(
      ":root:not([data-theme='light']) {",
    );
    expect(dark('@media (prefers-color-scheme: dark)')).toContain('--daric-background: #0a1328;');
  });

  it('replaces Tailwind default colors with the Daric palette', () => {
    const css = tailwindCss();
    expect(css).toContain('--color-*: initial;');
    expect(css).toContain('--color-gold-500: #c38f26;');
    expect(css).toContain('--color-navy-950: #0a1328;');
  });
});
