# 04: Design tokens v2

**What to build:** Both web and mobile draw from one refreshed set of design tokens matching the approved style tiles, with light and dark both designed explicitly.

**Blocked by:** 01

**Status:** done

- [x] Palette refined; semantic colours added (warning, info, Transfer, subtle surfaces, borders per elevation)
- [x] Spacing, radii, elevation, type scale (tuned for Persian) and motion durations/easings added
- [x] Tailwind theme and native theme both generated from the tokens
- [x] Contrast tests cover every new text-on-background pair at WCAG AA in both themes
- [x] Existing screens still render and their tests pass

Spec: `.scratch/design-refresh/spec.md`.

## Comments

**2026-10-24: implemented.**

- Palette roles follow ticket 01's approved values; gold and navy ramps unchanged.
- New semantic colours: `surfaceRaised`, `borderRaised` (popovers and sheets) and `borderStrong` (inputs, 3:1), `income`, `transfer`, `warning`, `info`, and subtle surfaces `primarySubtle`, `incomeSubtle`, `transferSubtle`, `warningSubtle`, `infoSubtle`, `dangerSubtle` for pills and banners in their role's text colour.
- `elevation` gives `card`, `popover` and `sheet` shadows per theme (Tailwind `shadow-card` …, native `boxShadow` strings); dark adds an inner top highlight.
- Radii are now 6 / 12 / 18 / 28, so existing `rounded-*` utilities grow until each screen is redesigned.
- Named `spacing` (`gutter`, `card`, `stack`, `section`, `touch` …) on the 4-point grid; display sizes `4xl`–`6xl`; `motion` durations and easings (Tailwind `ease-standard` …, `--daric-duration-*` variables that drop to 0ms under reduced motion).
