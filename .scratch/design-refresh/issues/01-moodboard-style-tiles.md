# 01: Moodboard and style tiles

**What to build:** The person running Daric sees one page with reference screens (Copilot Money, Revolut, Monzo: dashboard, transaction list, budgets, charts) and Daric's proposed visual language (colour, type, core components and the Home screen in light and dark, Persian and English), and approves the direction before any screen is redesigned.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Reference screens gathered and annotated with what to take from each
- [x] Style tiles show palette (gold kept for primary actions and highlights), type scale for Persian and Latin, radii, elevation, core components
- [x] Home screen mock in both themes and both languages
- [x] Bottom tab bar split decided (which four sections get a tab next to the "+")
- [x] Direction approved by the person running Daric; decisions recorded under Comments

Spec: `.scratch/design-refresh/spec.md`.

Page: `.scratch/design-refresh/moodboard.html` (published at https://claude.ai/artifact/AprP5bCJyguKJh1qqbRHAc).

## Comments

**2026-10-21: direction approved by the person running Daric, as proposed on the page.**

- **Tab bar:** Home · Transactions · + · Insights · More. Budgets is reached from the Home near-limit card and from More (Budgets, Accounts, Categories, Labels, Recurring, Rates, Settings, and Back Office for Operators).
- **Palette roles (input to DR-04):** brand gold and navy ramps unchanged. Light background moves to `#f5f6f8` (navy-tinted porcelain), surfaceMuted `#eef1f6`, foregroundMuted `#46587a`, border `#e3e8f0`. Dark surface `#111d36`, surfaceMuted `#18284a`, new surfaceRaised `#1a2b4d`, border `#1f3053`. New roles: borderStrong (light `#7489ad`, dark `#5b77a8`, 3:1 for input borders), income (`#067647` / `#47cd89`), transfer (`#5a45c7` / `#ada1ff`), warning (`#b54708` / `#f5b046`), info (`#0b6aa2` / `#6cc3f5`). Chart expense becomes navy (`#4a6aa3` / `#7d9bd0`), chart income dark `#2fbf71`. Gold is only for the primary action, the active state and highlights.
- **Money semantics:** Expense in the normal text colour with “−”; Income in green with “+”; Transfer in violet with the ⇄ icon and no sign. Each one also has a direction icon, so colour is never the only cue.
- **Budget states:** fine (green), near the limit (warning colour, icon and “near limit”), over (danger colour, icon, “Over budget” and a striped fill).
- **Type:** keep Vazirmatn (fa) and Inter (en). Add display sizes 36/48, 48/60 and 60/72 (weight 700) for balances. Tabular digits on every amount, and Persian digits in Persian.
- **Shape and depth:** radii 6 / 12 / 18 / 28 / full (chips full, inputs and buttons 12, cards 18, sheets 28). Three shadow levels (card, popover, sheet). Dark elevation adds a lighter surface plus an inset top highlight. 4-point spacing grid.
- **Icons:** Lucide outline set at 1.9 stroke (`lucide-react`, `lucide-react-native`). Category icons in white on rounded squares of the category colour.
- **Reference takeaways:** hero balance (Revolut); spend-to-date against a typical month, coloured category squares and thin budget bars (Copilot Money); day-grouped transactions with quiet spending, and muted chart bars with one highlighted (Monzo).
