# 06: Daric components

**What to build:** Screens can be built from Daric-specific pieces that show money, Categories, Labels, progress, charts and empty, loading and error states the same way everywhere.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Amount (formatted, tabular digits, sign and non-colour cue for Income, Expense, Transfer)
- [ ] Category badge, Label chip, Account card, Budget progress, stat card, page header, responsive list/table
- [ ] Chart frame (title, legend, text summary, empty and error states) and a shared chart theme from the tokens
- [ ] Empty state (with coin-and-archer motif), error state with retry, skeletons, error boundary per section
- [ ] Confirmation dialog and password confirmation (shared with the Back Office)
- [ ] Web tests cover empty-state action, error retry and password confirmation behaviour

Spec: `.scratch/design-refresh/spec.md`.

## Comments

**2026-10-24:** ticket 05 already built the confirmation dialog (`apps/web/src/ui/ConfirmDialog.tsx`, an alert dialog that starts on Cancel); reuse it here rather than building another.
