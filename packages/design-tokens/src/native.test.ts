import { describe, expect, it } from 'vitest';
import { nativeTheme, tailwindCss } from './index';

describe('nativeTheme', () => {
  it('spaces on a 4-point grid in density-independent pixels', () => {
    expect(nativeTheme.space(0)).toBe(0);
    expect(nativeTheme.space(1)).toBe(4);
    expect(nativeTheme.space(4)).toBe(16);
  });

  it('gives text styles with absolute line heights, as React Native requires', () => {
    expect(nativeTheme.text.base).toEqual({
      fontFamily: 'Vazirmatn',
      fontSize: 16,
      lineHeight: 26,
    });
    expect(nativeTheme.text.xs).toEqual({ fontFamily: 'Vazirmatn', fontSize: 12, lineHeight: 20 });
  });

  it('gives font weights as the strings React Native expects', () => {
    expect(nativeTheme.fontWeight.normal).toBe('400');
    expect(nativeTheme.fontWeight.bold).toBe('700');
  });

  it('gives radii in density-independent pixels', () => {
    expect(nativeTheme.radius.md).toBe(12);
  });

  it('gives semantic colors per theme', () => {
    expect(nativeTheme.colors.light.background).toMatch(/^#[0-9a-f]{6}$/);
    expect(nativeTheme.colors.dark.foreground).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('gives display text sizes for balances', () => {
    expect(nativeTheme.text['5xl']).toEqual({
      fontFamily: 'Vazirmatn',
      fontSize: 48,
      lineHeight: 60,
    });
  });

  it('gives named spacing in density-independent pixels', () => {
    expect(nativeTheme.spacing.gutter).toBe(16);
  });

  it('gives shadows per theme as React Native boxShadow strings', () => {
    expect(nativeTheme.elevation.light.card).toBe(tailwindShadow('light'));
    expect(nativeTheme.elevation.dark.sheet).toMatch(/ inset/);
  });

  it('gives motion in milliseconds and easings as bézier points for Reanimated', () => {
    expect(nativeTheme.motion.duration.base).toBe(200);
    expect(nativeTheme.motion.easing.standard).toEqual([0.2, 0, 0, 1]);
  });
});

/** The web preset's light card shadow, to show both platforms share one source. */
function tailwindShadow(theme: 'light' | 'dark'): string {
  const block = tailwindCss()
    .split('\n\n')
    .find((b) => b.startsWith(theme === 'light' ? ':root {' : ":root[data-theme='dark'] {"));
  return /--daric-shadow-card: (.*);/.exec(block ?? '')?.[1] ?? '';
}
