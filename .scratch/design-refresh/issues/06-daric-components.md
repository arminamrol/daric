# 06: Daric components

**What to build:** Screens can be built from Daric-specific pieces that show money, Categories, Labels, progress, charts and empty, loading and error states the same way everywhere.

**Blocked by:** 05

**Status:** done

- [x] Amount (formatted, tabular digits, sign and non-colour cue for Income, Expense, Transfer)
- [x] Category badge, Label chip, Account card, Budget progress, stat card, page header, responsive list/table
- [x] Chart frame (title, legend, text summary, empty and error states) and a shared chart theme from the tokens
- [x] Empty state (with coin-and-archer motif), error state with retry, skeletons, error boundary per section
- [x] Confirmation dialog and password confirmation (shared with the Back Office)
- [x] Web tests cover empty-state action, error retry and password confirmation behaviour

Spec: `.scratch/design-refresh/spec.md`.

## Comments

**2026-10-24:** ticket 05 already built the confirmation dialog (`apps/web/src/ui/ConfirmDialog.tsx`, an alert dialog that starts on Cancel); reuse it here rather than building another.

**2026-10-24: implemented.**

- Generic pieces in `apps/web/src/ui/`: `EmptyState` (faint coin-and-archer `CoinMotif`), `ErrorState` (retry), `SectionBoundary` (error boundary per section; retry also resets failed queries via TanStack's reset boundary), shaped skeletons (`ListSkeleton`, `CardSkeleton`, `ChartSkeleton`, announced once through `Loading`), `StatCard`, `PageHeader`, `ResponsiveTable` (table on wide screens, a card per row on a phone, one markup with explicit roles), `ChartFrame` (title, legend with shapes as well as colours, visible text summary, drawing hidden from screen readers, loading/empty/error in its place), `chartTheme` from the tokens, and `PasswordConfirmDialog` (extra fields such as a reason go in `children`; a rejected `onConfirm` keeps it open with the error under the password).
- Money and domain pieces in `apps/web/src/components/`: `Amount` (tabular digits; `+` Income, `−` Expense, arrows icon and no sign for a Transfer), `CategoryBadge` (moved here, optional `name`), `LabelChip`, `AccountCard`, `BudgetProgress`.
- Confirmation dialog: ticket 05's `ConfirmDialog`, reused.
- `UiLabels` gained loading, load-failed, retry, cancel and password; `i18n/uiLabels.ts` maps them from the translator for the app and tests.
- Adopted so far: `BudgetCard` uses `BudgetProgress` (near the limit now uses the warning colour instead of gold); the trend and Net Worth charts use `chartTheme`. Screens adopt the rest in their redesign tickets.
- Tests: `src/ui/states.test.tsx` (empty-state action, error retry, section boundary retry incl. a failed query, password confirmation) and `src/components/components.test.tsx`. Not yet reviewed by eye in the browser.
