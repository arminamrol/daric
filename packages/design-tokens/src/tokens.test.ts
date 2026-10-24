import { describe, expect, it } from 'vitest';
import {
  categoryPalette,
  elevation,
  motion,
  radius,
  spacing,
  spacingUnit,
  themes,
  typography,
} from './index';
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
  ...(['background', 'surface', 'surfaceMuted', 'surfaceRaised'] as const).flatMap(
    (bg): [SemanticColor, SemanticColor][] =>
      (
        [
          'foreground',
          'foregroundMuted',
          'accent',
          'danger',
          'success',
          'income',
          'transfer',
          'warning',
          'info',
        ] as const
      ).map((fg) => [fg, bg]),
  ),
  ['onPrimary', 'primary'],
  // A toast inverts the theme.
  ['background', 'foreground'],
  // Subtle surfaces carry their own role's text (a pill, a banner) and plain and muted text.
  ...(Object.keys(themes.light) as SemanticColor[])
    .filter((name) => name.endsWith('Subtle'))
    .flatMap((subtle): [SemanticColor, SemanticColor][] => {
      const role = subtle.replace(/Subtle$/, '') as SemanticColor;
      return [
        [role === 'primary' ? 'accent' : role, subtle],
        ['foreground', subtle],
        ['foregroundMuted', subtle],
      ];
    }),
];
const ui: [SemanticColor, SemanticColor][] = [
  ['focus', 'background'],
  ['focus', 'surface'],
  ['focus', 'surfaceMuted'],
  ['focus', 'surfaceRaised'],
  // Input borders must be visible on whatever the input sits on.
  ['borderStrong', 'background'],
  ['borderStrong', 'surface'],
  ['borderStrong', 'surfaceMuted'],
  ['borderStrong', 'surfaceRaised'],
  ['chartIncome', 'surface'],
  ['chartExpense', 'surface'],
  ['chartIncome', 'surfaceRaised'],
  ['chartExpense', 'surfaceRaised'],
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

describe('category palette', () => {
  it.each(Object.entries(categoryPalette))(
    'keeps a white icon readable on %s (4.5:1)',
    (_, hex) => {
      expect(contrast('#ffffff', hex)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('scales', () => {
  it('keeps every named spacing on the 4-point grid', () => {
    for (const px of Object.values(spacing)) expect(px % spacingUnit).toBe(0);
  });

  it('keeps touch targets at least 44 points', () => {
    expect(spacing.touch).toBeGreaterThanOrEqual(44);
  });

  it('rounds bigger objects more: small parts, inputs, cards, sheets', () => {
    expect([radius.sm, radius.md, radius.lg, radius.xl]).toEqual([6, 12, 18, 28]);
  });

  it('gives every text size a line height of at least 1.2, more for Persian body text', () => {
    for (const { fontSize, lineHeight } of Object.values(typography.size)) {
      expect(lineHeight / fontSize).toBeGreaterThanOrEqual(1.2);
    }
    expect(typography.size.base.lineHeight / typography.size.base.fontSize).toBeGreaterThanOrEqual(
      1.5,
    );
  });

  it('has display sizes for balances', () => {
    expect(typography.size['4xl']).toEqual({ fontSize: 36, lineHeight: 48 });
    expect(typography.size['5xl']).toEqual({ fontSize: 48, lineHeight: 60 });
    expect(typography.size['6xl']).toEqual({ fontSize: 60, lineHeight: 72 });
  });

  it('gives each theme a shadow for each elevation level', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(Object.keys(elevation[theme])).toEqual(['card', 'popover', 'sheet']);
    }
    // Shadows barely show on navy, so dark elevation adds an inner top highlight.
    for (const shadow of Object.values(elevation.dark)) expect(shadow).toMatch(/ inset/);
  });

  it('orders motion durations from quick to emphasised, with easings as cubic-bézier points', () => {
    const { fast, base, slow, emphasis } = motion.duration;
    expect(fast < base && base < slow && slow < emphasis).toBe(true);
    for (const curve of Object.values(motion.easing)) {
      expect(curve).toHaveLength(4);
      for (const x of [curve[0], curve[2]]) expect(x >= 0 && x <= 1).toBe(true);
    }
  });
});
