import { describe, expect, it } from 'vitest';
import { themes } from './index';
import type { SemanticColor } from './index';

/** WCAG 2.x contrast ratio of two `#rrggbb` colors. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

// Text needs 4.5:1 (WCAG AA); focus rings and other UI parts need 3:1.
const text: [SemanticColor, SemanticColor][] = [
  ['foreground', 'background'],
  ['foreground', 'surface'],
  ['foreground', 'surfaceMuted'],
  ['foregroundMuted', 'background'],
  ['foregroundMuted', 'surface'],
  ['accent', 'background'],
  ['accent', 'surface'],
  ['onPrimary', 'primary'],
  ['danger', 'background'],
  ['danger', 'surface'],
  ['success', 'background'],
  ['success', 'surface'],
];
const ui: [SemanticColor, SemanticColor][] = [
  ['focus', 'background'],
  ['focus', 'surface'],
  ['focus', 'surfaceMuted'],
];

describe('contrast helper', () => {
  it('matches known WCAG ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe.each(['light', 'dark'] as const)('%s theme', (name) => {
  const colors = themes[name];

  it.each(text)('%s on %s is readable text (4.5:1)', (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ui)('%s on %s is a visible UI part (3:1)', (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(3);
  });
});
