# 04: i18n, design tokens and web shell

**What to build:** Opening the web app shows an empty, Persian, RTL, themed shell (light and dark) with the Daric palette and self-hosted Vazirmatn, installable as a PWA.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] i18n package with fa dictionary, typed keys, direction helper; en dictionary stub so English can be added without refactoring
- [ ] Design tokens (gold/deep-navy palette, spacing, typography) exported as Tailwind preset and RN theme
- [ ] Web app: Vite + React Router + TanStack Query + Tailwind, `dir` and `lang` driven by locale
- [ ] Only logical CSS properties (start/end, ms/me/ps/pe); lint rule or check forbidding left/right utilities
- [ ] Dark mode toggle and system preference; accessible focus styles
- [ ] Fonts self-hosted (no external CDN); PWA manifest and app-shell service worker
