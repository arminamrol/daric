# 03: Logo and brand assets

**What to build:** Users see the new Daric logo everywhere: browser tab, installed web app, the app's home-screen icon and splash, and in the app itself.

**Blocked by:** 02

**Status:** done

- [x] Chosen concept refined into the mark and the mark with the name in Persian and English, light and dark
- [x] Favicon and installed-web-app icons regenerated from it
- [x] Mobile app icon and splash replaced
- [x] The Logo component on web and mobile renders the new mark
- [x] Placeholder logo removed

Spec: `.scratch/design-refresh/spec.md`.

## Comments

**2026-10-24: Brand assets built from the Breaking rim mark.**

- **Single source:** `packages/design-tokens/src/logo.ts` holds the mark geometry (`logoMark`) and colors (`logoColors`, from the theme's primary and on-primary). The web and mobile `Logo` components and every brand file are drawn from it.
- **Refinement:** rim moved to r 23.5 with a 3-unit stroke so its edges sit on whole pixels at 32px and it stays visible at 16px; the arrowhead tip moved out to (50.5, 13.5) and now cuts the rim with a coin-colored halo instead of a separate knockout line; fletchings shortened and moved in so they clear the rim. Tests assert the head breaks the rim while staying on the coin, and the fletchings clear it.
- **Files:** `packages/design-tokens/brand/`: mark, Persian and English lockups and app icon in light and dark, Android adaptive-icon foreground, and the favicon (switches to the dark gold with the system theme; also served as `apps/web/public/favicon.svg`). Lockup names are outlined (HarfBuzz-shaped Vazirmatn 800 and Inter 700) in `src/wordmarks.ts`, so the files need no font. Regenerate with `pnpm --filter @daric/design-tokens generate`.
- **Rasters:** `pnpm --filter @daric/design-tokens rasterize` renders the web favicon.ico (16/32/48), PWA icons, maskable and Apple touch icons, and the mobile icon (light and dark), adaptive icon and splash images. Replaces the web `icons` script.
- **Mobile:** `app.json` sets the icon (iOS light and dark), Android adaptive icon on gold-50, and the splash through `expo-splash-screen` (gold-50 in light, navy-950 in dark). The new mobile `Logo` shows on the login screen.
