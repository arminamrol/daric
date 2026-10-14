# 32: Mobile: Net Worth, Projection, Reports

**What to build:** Mobile users see Net Worth and history, Projection (all modes, with assumptions), Reports and controllable spending.

**Blocked by:** 31, 21, 23, 25

**Status:** done

- [x] react-native-svg based charts with accessible summaries
- [x] Parity with web for these features

## Comments

Notes for later tickets:

- Mobile: More leads to Net Worth (`/net-worth`, each Account opens its Valuations at `/net-worth/[accountId]`), Projection (`/projection`, Planned Items at `/projection/new` and `/projection/[id]`) and Reports (`/reports`; the Period is screen state, not a URL).
- Charts: `src/charts/geometry.ts` places marks (`linePlot`, `barPlot`, `niceTicks`, `nearest`, `extremes`) and is tested in Node; `src/charts/Chart.tsx` draws them with react-native-svg. Each chart is read out as one image with a summary (`netWorth.chartSummary`, `reports.trendSummary`); a touch shows one point's figures to sighted users, and a toggle lists every figure. No new native module: `react-native-svg` came with 31.
- The savings slider is a −/+ stepper (`ui/Stepper.tsx`, `accessibilityRole="adjustable"`), as React Native has no slider without a new native module.
- Shared mobile helpers added: `ui/Card.tsx` (`Card`, `Rows`, `Heading`, `Figure`), `ui/ScrollScreen.tsx`, `ui/RateNotes.tsx` (no "add rate" link: there is no rates screen on mobile), `display/labels.ts` (`CALENDAR_LABELS`), `useShownInBase` and `useCurrencyList` in `display/formatters.ts`.
- The screens were not run on a device; the JS bundle was checked with `expo export`.
- Open points from review:
  - Taking a snapshot, Valuations, Planned Items and the Projection's mode and Trailing Average length are sent straight to the API, not through the offline queue: they fail offline with "save failed". ADR-0005 asks both clients to accept edits offline; queueing these needs `createOnce` on their API create endpoints and new `WorkspaceWrite` entities (the web has the same gap).
  - Reports name a child Category by its own name under its parent's line, as the web does; the Projection uses `parent › child`.
  - `useCategoryNames` (Projection) is the same in both apps, like `useBudgetNames`.
  - The "no Controllable Labels yet" prompt counts archived Labels too, as on the web.
