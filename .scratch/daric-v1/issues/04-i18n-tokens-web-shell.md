# 04: i18n, design tokens and web shell

**What to build:** Opening the web app shows an empty, Persian, RTL, themed shell (light and dark) with the Daric palette and self-hosted Vazirmatn, installable as a PWA.

**Blocked by:** 02, 03

**Status:** done

- [x] i18n package with fa dictionary, typed keys, direction helper; en dictionary stub so English can be added without refactoring
- [x] Design tokens (gold/deep-navy palette, spacing, typography) exported as Tailwind preset and RN theme
- [x] Web app: Vite + React Router + TanStack Query + Tailwind, `dir` and `lang` driven by locale
- [x] Only logical CSS properties (start/end, ms/me/ps/pe); lint rule or check forbidding left/right utilities
- [x] Dark mode toggle and system preference; accessible focus styles
- [x] Fonts self-hosted (no external CDN); PWA manifest and app-shell service worker

## Comments

Notes for later tickets:

- The Persian app name is **دریک** (English: Daric).
- `@daric/i18n`: `fa.ts` is the source of truth for keys and `{param}` placeholders; `t(key, params)` is typed on both. `en.ts` is a `Partial` stub; missing English keys fall back to Persian (33 completes it and adds the missing-key check). `PlainMessageKey` types message keys picked from data (option lists). `isolate()` wraps values from outside the dictionary (paths, account names) in Unicode isolates so mixed Persian/Latin text does not reorder.
- `@daric/design-tokens`: TS tokens (palette, semantic light/dark colors, spacing unit, type scale, radii) are the single source. `tailwind.css` is the Tailwind v4 preset (v4 has no JS presets), generated from the tokens and kept in sync by a Vitest file snapshot; regenerate with `pnpm --filter @daric/design-tokens generate`. Tailwind's default colors are removed. `nativeTheme` is for the Expo app (30); its font family is `Vazirmatn`, the same name the web uses. On Android, Expo-loaded fonts usually need one family name per weight (e.g. `Vazirmatn-Bold`) rather than `fontWeight`; 30 should adjust `nativeTheme.text`/`fontWeight` to however it registers the font files.
- Themes: semantic colors switch on `<html data-theme="light|dark">` and follow `prefers-color-scheme` when the attribute is absent, so components never need `dark:`. The preference is per device in `localStorage` (`daric.theme`); an inline script in `index.html` applies it before first paint. The browser bar uses per-scheme `theme-color` tags (surface color), recolored when a theme is pinned.
- Logical properties (shared ESLint preset): `daric/logical-classes` checks every string inside a `className` value. It rejects left/right utilities that have a logical twin (`ml-`, `pr-`, `left-`, `text-right`, `rounded-l`, …) and left/right arbitrary properties (`[margin-left:…]`). Utilities with no logical twin (`origin-left`, `bg-right`, `object-left`, `mask-l-`) are allowed only under `ltr:`/`rtl:`. `daric/logical-apply` applies the same check to `@apply` in CSS, and `@eslint/css` `prefer-logical-properties` rejects left/right CSS properties (top/bottom/width/height stay allowed). Class strings stored in a variable outside `className` are not checked. The preset now scopes JS/TS rules to code files so CSS can be linted.
- Web: React Router 7 (8 needs Node 22.22+, above the repo's engines). Vite loads `vite.config.ts` with `--configLoader runner` because workspace packages ship TS source. The manifest takes its name from `fa['app.name']` and colors from the tokens. The service worker precaches the build and answers every navigation with `index.html`; if the API ever shares the web origin, add its prefix to `navigateFallbackDenylist`. Data caching and offline writes are 15.
- Icons are placeholders generated from `apps/web/public/favicon.svg` (`pnpm --filter @daric/web icons`); 35 replaces the logo.
- CI now runs `pnpm build` too.
