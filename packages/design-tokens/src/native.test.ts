import { describe, expect, it } from 'vitest';
import { nativeTheme } from './index';

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
    expect(nativeTheme.radius.md).toBe(8);
  });

  it('gives semantic colors per theme', () => {
    expect(nativeTheme.colors.light.background).toMatch(/^#[0-9a-f]{6}$/);
    expect(nativeTheme.colors.dark.foreground).toMatch(/^#[0-9a-f]{6}$/);
  });
});
