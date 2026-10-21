# Design refresh: modern, premium Daric on web, mobile web and the app

**Status:** ready-for-agent

## Problem Statement

Daric works, but it does not look or feel like a product people want to open every day. The web app has almost no shared components, so every screen is styled on its own and looks slightly different; it was laid out for a desktop browser and is cramped and awkward on a phone. The mobile app uses its own small set of hand-made pieces that do not match the web. The logo is a placeholder. New Users land on an empty app with no guidance, empty lists say nothing helpful, errors give no way to retry, and accessibility has never been reviewed. For a finance app whose name is a gold coin, it does not feel trustworthy, calm or premium.

## Solution

One visual language for Daric, built once and used everywhere: a new coin-and-archer logo, modernised gold-and-navy tokens with first-class light and dark themes, and a component library (shadcn/ui on Radix and Tailwind on the web, a matching kit on mobile) fed by the shared tokens. The feel is calm and premium: big clear numbers, soft surfaces, generous space, smooth charts, gold kept for what matters, a touch of warmth from the coin motif. Persian and right-to-left come first, English mirrors cleanly. Every web screen is redesigned once, mobile first, so it works from a phone to a wide desktop; desktop gets a collapsible sidebar, phones get a bottom tab bar with a central "+" to record a Transaction. The mobile app then follows with the same patterns. Along the way new Users get a short onboarding, every list gets a helpful empty state, every failure gets a clear error with retry, and the whole app passes an accessibility review.

## User Stories

### Brand and logo

1. As a User, I want a distinctive Daric logo built on the coin and its archer, so that the app feels like a real product I can trust.
2. As a User, I want the logo to stay recognisable as a 16px browser tab icon, so that I can find Daric among my tabs.
3. As a User, I want a polished app icon on my home screen, in light and dark, so that Daric looks at home on my phone.
4. As a User installing the web app, I want a proper installed-app icon and splash, so that the installed app feels native.
5. As the person running Daric, I want three or four logo concepts to choose from before one is refined, so that the brand is a considered choice.
6. As a User, I want the logo and name to read well in Persian and English, so that the brand works in both languages.

### Visual language

7. As a User, I want calm, premium visuals (soft surfaces, generous space, clear hierarchy), so that looking at my money feels reassuring rather than stressful.
8. As a User, I want gold used for the main action and highlights only, so that I always know what matters on a screen.
9. As a User, I want balances and totals shown big and clear, so that I get the answer at a glance.
10. As a User, I want Income, Expense and Transfer distinguishable without relying on colour alone, so that I can read them under any colour-vision condition.
11. As a User, I want the app to follow my system's light or dark setting, so that it matches the rest of my device.
12. As a User, I want to override the theme in Settings, so that I can pick the one I like.
13. As a User, I want light and dark to both look designed, not one inverted from the other, so that neither feels second-class.
14. As a User reading Persian, I want a typeface made for Persian with comfortable line height and Persian digits in Persian, so that reading numbers and text is effortless.
15. As a User reading English, I want a matching Latin typeface, so that both languages feel like the same product.
16. As a User, I want amounts aligned with tabular digits in lists and tables, so that columns of numbers are easy to compare.
17. As a User, I want consistent icons across the whole app, so that I learn them once.
18. As a User, I want charts styled consistently with soft colours, readable labels and tooltips, so that reports are pleasant to explore.

### Layout and navigation

19. As a User on a desktop browser, I want a sidebar with the main sections, so that everything is one click away.
20. As a User on a desktop browser, I want to collapse the sidebar, so that I have more room for reports.
21. As a User on a phone browser, I want a bottom tab bar with the main sections, so that I can move around with my thumb.
22. As a User on a phone, I want a central "+" button that starts recording a Transaction, so that the thing I do most is always one tap away.
23. As a User, I want the same sections in the same order on the web and the app, so that switching between them needs no relearning.
24. As a User, I want the Workspace switcher always reachable, so that I can move between Workspaces quickly.
25. As a User, I want my current place shown clearly in the navigation, so that I always know where I am.
26. As a User on any width from a small phone to a wide desktop, I want every screen to fit without horizontal scrolling, so that nothing is cut off.
27. As a User on a large screen, I want content kept to a readable width with extra space used for side panels or wider charts, so that lines do not become too long.
28. As a User on a phone, I want forms to open as full-screen sheets with the keyboard-friendly field types, so that entering data is quick.
29. As a User on a phone, I want touch targets big enough to hit easily, so that I do not tap the wrong thing.

### Screens (web, responsive)

30. As a User, I want a Home screen that shows my Net Worth, this Period's Income and Expense, Budgets close to their limit, Due Occurrences and recent Transactions, so that I see my situation at a glance.
31. As a User, I want the Transactions list grouped by day with clear amounts, Category icons and Labels, so that I can scan my activity.
32. As a User, I want filters on the Transactions list that collapse into a sheet on phones, so that filtering does not crowd a small screen.
33. As a User, I want recording a Transaction to be quick: amount first, then Category, Account and date, with sensible defaults, so that I can record on the go.
34. As a User, I want Transfers to look different from Income and Expense everywhere, so that I never mistake moving money for spending it.
35. As a User, I want Accounts shown as cards with balance and type, Assets apart from Liabilities, so that I see what I own and owe.
36. As a User, I want Budgets shown with progress that warns as I near or pass the limit, so that I can slow down in time.
37. As a User, I want Categories and Labels to be easy to manage with colour and icon pickers, so that organising feels light.
38. As a User, I want Recurring Rules and Due Occurrences to be clear, with one-tap confirm, so that recurring money takes no effort.
39. As a User, I want Net Worth with a smooth history chart and Valuations, so that I can see my progress over time.
40. As a User, I want the Projection to explain its numbers visually (actuals so far versus estimate to year end), so that I understand where it comes from.
41. As a User, I want Reports with charts that work on a phone (swipe between Periods, tap for details), so that I can explore spending anywhere.
42. As a User, I want Controllable Spending to stand out with what I could save, so that I know where to cut back.
43. As a User, I want Exchange Rates to be simple to read and update, so that multi-currency totals stay correct.
44. As a User, I want Settings grouped into clear sections (profile, Workspace, display, Members, Plan, devices, data, privacy), so that I find what I look for.
45. As a User, I want the Plan, checkout and paywall to look trustworthy and show exactly what I get and pay, so that I am comfortable buying Plus.
46. As a User, I want sign-up, login, forgot-password, reset-password, verify-email and invitation pages to look like the same polished product, so that my first contact with Daric is a good one.
47. As a User, I want Members and Invitations, Consents, the Workspace audit log and account deletion to follow the same patterns as every other screen, so that nothing feels unfinished.
48. As a User, I want a friendly not-found page that takes me home, so that a wrong link is not a dead end.
49. As a User, I want the Grace Period and plan-lapse notices to be clear but calm, so that I know what is happening without feeling threatened.
50. As a User, I want offline and sync status shown subtly and consistently, so that I know whether my changes have reached the server.

### Onboarding (replaces ticket 34)

51. As a new User, I want a short first-run wizard on the web and the app, so that Daric is set up for me before I start.
52. As a new User, I want to choose my Base Currency, so that totals are in the money I think in.
53. As a new User, I want to choose Jalali or Gregorian and my timezone for my Workspace Calendar, so that Periods match my months.
54. As a new User, I want to choose whether amounts show in Rial or Toman, so that numbers look the way I am used to.
55. As a new User, I want to choose my language, so that the app speaks to me from the first screen.
56. As a new User on a device, I want to choose whether this device keeps data offline, so that I decide where my financial data lives.
57. As a new User, I want every step skippable with sensible defaults, so that I can start immediately if I want.
58. As a new User, I want my choices saved through the normal settings, so that I can change them later in Settings.
59. As a new User, I want to see where I am in the wizard and go back a step, so that I am never lost.
60. As a returning User, I want the wizard to never appear again once finished or skipped, so that it does not get in the way.

### Empty, loading and error states (replaces ticket 35)

61. As a new User, I want every empty list to explain what goes there and offer the action that fills it, so that I know what to do next.
62. As a User, I want empty states with a subtle coin-and-archer illustration, so that empty screens still feel cared for.
63. As a User, I want loading shown as skeletons shaped like the content, so that the screen does not jump when data arrives.
64. As a User, I want a clear error with a retry button when something fails to load, so that I can recover without reloading the app.
65. As a User, I want a failure in one part of a screen to not blank the whole app, so that the rest keeps working.
66. As a User, I want success and failure of my actions shown as short, non-blocking messages, so that I know my change went through.
67. As a User, I want destructive actions to ask for confirmation in a consistent way, so that I do not delete by accident.

### Accessibility

68. As a User relying on a screen reader, I want every control labelled and every chart given a text summary, so that I can use Daric without seeing it.
69. As a keyboard User, I want a visible focus ring and a logical focus order on every screen, including dialogs and sheets, so that I can use Daric without a mouse.
70. As a User with low vision, I want text and controls to meet WCAG AA contrast in both themes, so that I can read everything.
71. As a User who enlarges text, I want layouts to grow with my text size without breaking, so that I can read comfortably.
72. As a User sensitive to motion, I want animations reduced when my system asks for it, so that the app does not make me uncomfortable.
73. As a User of right-to-left Persian, I want layout, icons that imply direction and charts mirrored correctly, so that the app reads naturally.

### Motion

74. As a User, I want subtle transitions when sheets, dialogs and menus open, so that the app feels smooth.
75. As a User, I want balances to count up gently when they change, so that changes feel alive without being distracting.
76. As a User, I want charts to animate in once, so that reports feel polished.
77. As a User, I want lists to animate items being added or removed, so that I see what changed.

### Mobile app

78. As a mobile User, I want the app to look and work like the redesigned web app, so that Daric is one product.
79. As a mobile User, I want a bottom tab bar with the central "+", so that recording a Transaction is one tap away.
80. As a mobile User, I want native-feeling sheets, haptics on key actions and smooth gestures, so that the app feels at home on my phone.
81. As a mobile User, I want the new app icon and splash screen, so that the app looks finished on my home screen.
82. As a mobile User, I want the same onboarding, empty states and error states as the web, so that nothing is missing on the phone.
83. As a mobile User, I want right-to-left layout and screen-reader labels on every screen, so that the app is accessible in Persian.

### Design process

84. As the person running Daric, I want a moodboard and style tiles (colour, type, components, one sample screen in both themes) to approve before screens are redesigned, so that the direction is locked once.
85. As the person running Daric, I want reference screens from apps with a similar calm, premium feel to inform the moodboard, so that the direction is grounded in what works.
86. As a developer, I want every redesigned screen to keep all existing behaviour, so that the redesign never breaks a feature.

## Implementation Decisions

### Order of work

1. Foundation: moodboard and style tiles approved, logo chosen and refined, tokens updated, web component library and the new app shell (sidebar, bottom tab bar, "+").
2. The Back Office effort (`.scratch/back-office/spec.md`) is built next, on the new components.
3. Web screens, one responsive pass per screen, mobile first, grouped by area (auth, Home, Transactions, Accounts, Categories and Labels, Budgets, Recurring, Net Worth and Rates, Projection, Reports, Settings and its sub-pages, billing). Onboarding and the empty, loading and error states are built as part of this.
4. Mobile app: the native kit on the same tokens, then its screens with the same patterns and onboarding.
5. Ticket 44 (mobile paywall) follows the mobile redesign.

### Brand

- Keep the coin gold and deep navy palette as the brand identity; modernise around it rather than replace it. Gold is reserved for primary actions, the logo and highlights; navy and neutrals carry the surfaces.
- The logo is a simple geometric mark built on the Daric coin and its archer, legible at 16px. Three or four concepts are drawn as SVG and presented on one page; the chosen one is refined into: the mark, the mark with the name in Persian and English, light and dark versions, favicon, installed-web-app icons and the mobile app icon and splash.
- The coin-and-archer motif returns subtly in empty-state illustrations.

### Tokens

- The shared design-token package stays the single source of truth for both web and mobile. It is extended with: refined palette steps, more semantic colours (e.g. warning, info, Transfer, subtle surfaces, borders for each elevation), a spacing scale, radii, elevation (shadows), type scale (sizes, weights, line heights tuned for Persian), and motion durations and easings.
- Both themes are designed explicitly. Every text-on-background pair keeps meeting WCAG AA, enforced by the existing contrast tests.
- The theme keeps following the system by default, with today's light, dark and system choice; the choice also becomes available on mobile.
- The Tailwind theme and the native theme are both generated from the tokens, as today.

### Web components

- Adopt shadcn/ui (Radix primitives with Tailwind), copied into the web app and themed only through the tokens. It provides the accessible primitives: dialog, sheet, dropdown menu, popover, select, tabs, tooltip, toast, form fields, command menu, skeleton.
- Daric-specific components on top: Amount (formatted, tabular digits, sign and colour for Income, Expense and Transfer), Category badge, Label chip, Account card, Budget progress, stat card, chart frame (title, legend, text summary, empty and error states), empty state, error state with retry, page header, responsive list/table, confirmation dialog, password confirmation (shared with the Back Office).
- Existing shared web components (choice group, confirm button, paywall) are replaced by the new ones.
- Charts stay on the current chart library, restyled through a shared chart theme from the tokens.
- Layout uses logical properties only (start/end, never left/right) so right-to-left and left-to-right come from the same code. Icons that imply direction flip in right-to-left.
- Motion: CSS transitions by default; the `motion` library only where a component needs layout or presence animation (sheets, list add/remove, reordering). Everything respects reduced motion.

### App shell and information architecture

- Sections, the same on web and mobile: Home, Transactions, Budgets, Insights (Reports, Controllable Spending, Projection, Net Worth), More (Accounts, Categories, Labels, Recurring, Rates, Settings, Back Office for Operators).
- Desktop (wide) web: collapsible sidebar with the sections, Workspace switcher at the top, the "record a Transaction" action prominent.
- Phone-width web and the mobile app: bottom tab bar with four tabs and a central "+" that opens the record-a-Transaction sheet; More opens a list of the remaining sections. Which four of the five sections get a tab (Budgets and Insights compete for the last one, the other reached from Home and More) is settled with the style tiles.
- The breakpoint between them is chosen during the foundation; every screen is designed at phone width first.
- Existing routes keep their addresses, so links in emails and the mobile deep links keep working.

### Onboarding

- A first-run wizard, on web and mobile, shown once after the first sign-in to a new personal Workspace: language, Base Currency, Workspace Calendar (calendar and timezone), Rial or Toman display, and on that device whether to keep data offline.
- Every step has a default taken from the device (language, timezone) or today's defaults, and can be skipped; "skip all" is always available.
- Choices are saved through the existing User and Workspace settings endpoints. Whether onboarding is finished is stored per User on the server, so it does not appear again on another device; the offline choice stays per device as today.
- Invited Users joining someone else's Workspace only see the User-level steps (language, display, offline), not Workspace ones.

### Empty, loading and error states

- Every list and chart has an empty state with a short explanation, the action that fills it and the motif illustration.
- Every data load shows a skeleton shaped like its content.
- Every section that loads data is wrapped in an error boundary showing an error state with retry, so one failure does not take down the screen. Mutation results show as toasts.
- These are components from the library, so every screen uses the same ones.

### Mobile

- A native kit mirroring the web components (same names and props where sensible), themed from the same tokens, replacing the current hand-made UI pieces.
- Bottom tab navigation with a central "+", native sheets for forms, haptics on recording a Transaction and on confirmations, Reanimated for motion, respecting reduced motion.
- The new app icon and splash. Right-to-left and screen-reader labels on every screen.

### Process

- Moodboard and style tiles are presented on a page for approval before screen work starts, informed by reference screens from Copilot Money, Revolut and Monzo (dashboard, transaction list, budgets, charts) and showing colour, type, core components and the Home screen in both themes and both languages.
- No Figma screens for every page: once the style tiles are approved, screens are designed directly in code and reviewed in the browser at phone, tablet and desktop widths, in both themes and both languages.

## Testing Decisions

- Tests check behaviour the User sees (roles, labels, text, what happens on an action), never class names, styles or component internals, so the redesign can change every visual without touching a test's intent.
- **Web tests** render the app against the fake API, as all existing page tests do. The existing tests must keep passing through the redesign; they are the guard that no behaviour changed. Where a redesign moves a control (e.g. a filter into a sheet on narrow screens), the test is updated to reach it the new way, not removed. New tests cover: the onboarding wizard (steps, skipping, defaults, saved through settings, not shown again, invited User sees only User-level steps); empty states offering their action; error states retrying; navigation (sidebar and tab bar sections, "+" opening the Transaction form, More list, Back Office only for Operators); the theme following the system and the override.
- **Token tests** keep asserting WCAG AA contrast for every text-on-background pair in both themes and are extended to every new semantic colour, and that the Tailwind and native themes are generated from the same tokens, as the current token tests do.
- **Mobile tests** stay pure-logic, as today (e.g. right-to-left helpers, chart geometry, form drafts); no React Native component test harness is added.
- **No visual-regression or screenshot tests.** Visual quality is reviewed by hand in the browser at phone, tablet and desktop widths, in both themes and both languages, before each screen group is merged.
- The accessibility review is part of each screen's work: keyboard-only walkthrough, screen-reader labels, focus order in dialogs and sheets, enlarged text, reduced motion.

## Out of Scope

- New features or behaviour changes on any screen beyond onboarding and the empty, loading and error states; the redesign keeps today's behaviour.
- AI screens (deferred to `.scratch/daric-later/`).
- The Back Office's pages themselves (`.scratch/back-office/spec.md`), which only reuse this design system.
- A marketing or landing site.
- Full Figma designs for every screen.
- Visual-regression tooling.
- A cross-platform UI kit shared between web and native (e.g. Tamagui); web and mobile share tokens and patterns, not component code.
- Changing the mobile paywall (ticket 44), which follows this effort.

## Further Notes

- Supersedes tickets 34 (onboarding) and 35 (empty and error states, accessibility, logo), kept for reference in this folder's `folded-tickets/`.
- Persian is the default language, so every screen is designed in Persian and right-to-left first and checked in English afterwards.
- The calm, premium direction leans dark-friendly (big numbers, smooth charts on deep navy), but light is the default on most phones and must be just as polished.
