# 07: New app shell and navigation

**What to build:** On a desktop browser Users get a collapsible sidebar; on a phone browser a bottom tab bar with a central "+" that opens the record-a-Transaction sheet; every section is reachable the same way on both.

**Blocked by:** 03, 06

**Status:** done

- [x] Sections: Home, Transactions, Budgets, Insights, More (as split in 01); More lists Accounts, Categories, Labels, Recurring, Rates, Settings
- [x] Desktop sidebar collapsible, with Workspace switcher and record-a-Transaction action
- [x] Phone tab bar with "+" opening the Transaction form as a sheet
- [x] A slot for a Back Office link shown only to Operators
- [x] Existing routes keep their addresses; email links and mobile deep links still work
- [x] Offline/sync status and Grace Period notice placed in the shell
- [x] Web tests cover sidebar and tab bar navigation and the "+" sheet; existing tests pass

Spec: `.scratch/design-refresh/spec.md`.

## Comments

**2026-10-24: implemented.**

- Breakpoint: `(min-width: 64rem)` (`apps/web/src/shell/useWideScreen.ts`). From there up the app has the sidebar; below it, the phone top bar and tab bar. Without `matchMedia` (tests) the screen counts as wide, so tests that click section links keep working; phone tests stub `matchMedia`.
- Sections live in `shell/sections.ts`. The sidebar shows Home, Transactions and Budgets, then Insights (Reports, Projection, Net Worth) and More (Accounts, Categories, Labels, Recurring, Rates, Settings, Back Office) as named groups. The tab bar is Home · Transactions · + · Insights · More, as decided in 01. Insights and More open a bottom sheet listing their pages, and on the phone More starts with Budgets.
- The sidebar collapses to icons and remembers that on the device (`daric.sidebarCollapsed`). When collapsed, the Workspace switcher and theme choice open from popovers. On the phone, the theme choice and logging out are in the More sheet.
- Recording a Transaction: `transactions/RecordTransaction.tsx` (moved out of the Transactions page) runs inside `shell/RecordTransactionSheet.tsx`. The sheet is full screen from the bottom on a phone and comes in from the end on a wide screen. It stays open after each save for the next one. Viewers get no record action.
- Back Office slot: `Me.user.operator` is an optional field in `@daric/core`; when it is absent the User is not an Operator. BO-02 makes the API send it and adds the `/back-office` route; until then the link leads to not-found. The Persian label is «بک‌آفیس», avoiding «مدیر» (Admin is a Workspace Role).
- Sync status and the Grace Period notice sit above every page inside `<main>`. The page keeps its place in the tree whichever frame surrounds it (guest, sidebar, tab bar), so signing in or rotating the screen never remounts it. That matters because a mailed link's page reads its token only once.
- Fixed a race exposed by the new effect order: `refreshAfterChange` now cancels a first fetch still in flight before it invalidates. Without that, TanStack waited on the stale fetch, and auto-posted occurrences were missing from the list.
- Checked in the browser at desktop width in Persian and dark: the sidebar, the collapsed sidebar and the record sheet. The phone width could not be checked here because the browser window would not resize, so ticket 21's sweep should cover it.
