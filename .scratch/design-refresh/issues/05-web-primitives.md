# 05: Web component primitives (shadcn/ui)

**What to build:** The web app gets accessible, themed building blocks, proven by redesigning the Settings page with them.

**Blocked by:** 04

**Status:** done

- [x] shadcn/ui (Radix + Tailwind) added and themed only through the tokens
- [x] Primitives available: dialog, sheet, dropdown menu, popover, select, tabs, tooltip, toast, form fields, skeleton
- [x] Layout uses logical properties only; RTL and LTR both correct
- [x] Choice group and confirm button replaced by the new primitives everywhere they are used
- [x] Settings page rebuilt with them as the proof; its tests pass

Spec: `.scratch/design-refresh/spec.md`.

## Comments

**2026-10-24: implemented.**

- shadcn/ui components are copied into `apps/web/src/ui/` (PascalCase files like the rest of the app, relative imports, no `components.json`), on the `radix-ui` package, `class-variance-authority`, `tailwind-merge` (taught the token spacing, shadow and easing names) and `tw-animate-css`. Toasts use Sonner, as shadcn does. Colours, radii, shadows, spacing and durations come only from the token utilities; animations use the `--daric-duration-*` variables, so they stop under reduced motion.
- Primitives: `Button`, `Card`, `Dialog`, `AlertDialog`, `Sheet` (sides `start`, `end`, `bottom`), `DropdownMenu`, `Popover`, `Select` (Radix) and `NativeSelect` (for plain and long lists such as timezones), `Tabs`, `Tooltip`, `Toaster`/`toast`, form fields (`Label`, `Input`, `Textarea`, `Field`, `FieldDescription`, `FieldError`, `FieldSet`, `FormMessage`), `RadioGroup`, `SegmentedControl`, `Skeleton`. The spec's command menu is not in this ticket's list and is not built yet.
- New semantic token `scrim` (navy at 40% in light, near-black at 60% in dark) for the backdrop behind dialogs and sheets; `cn` reads the token spacing, shadow and easing names from `@daric/design-tokens`.
- `UiProvider` (inside `AppProviders`) gives the primitives the locale's direction (Radix arrow keys, menus and sheets mirror in RTL), their own translated words (`ui.close`, `ui.notifications`), one tooltip timer and the toast region.
- RTL: the `daric/logical-classes` lint rule now also checks the arguments of `cn`, `cva`, `clsx` and `twMerge` anywhere in a file, since shadcn keeps its classes there. Direction-implying chevrons flip with `rtl:-scale-x-100`.
- `ChoiceGroup` → `SegmentedControl` (Radix radio group; inside a disabled `<fieldset>` it also needs `disabled`); `ConfirmButton` → `ConfirmDialog` (alert dialog, focus starts on Cancel). This delivers ticket 06's confirmation dialog.
- Tests updated only where reach changed: Radix radios report `aria-checked`, so checks use `getByRole('radio', { checked: true })`; the group's role is now `radiogroup`; the confirmation is reached in its `alertdialog`, which renders outside the row. New `src/ui/primitives.test.tsx` covers the primitives' behaviour in RTL and LTR. The test setup stubs `ResizeObserver`, `scrollIntoView` and pointer capture for Radix.
- Settings rebuilt from `Card`, `Field`, `NativeSelect`, `SegmentedControl`, `Button` and a section list; full redesign stays with ticket 19. Checked in the browser in Persian/dark; phone widths and English are left for ticket 19's review.
