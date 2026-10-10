# 08: Workspace and user settings

**What to build:** The Owner sets the Workspace's Base Currency, calendar, timezone and Rial/Toman display; each user sets their display calendar, digits and theme, and the whole UI follows them.

**Blocked by:** 06

**Status:** done

- [x] Workspace settings API (Owner/Admin) and user preferences API
- [x] Settings screens on web
- [x] Money and dates across the app render using these settings via core formatters
- [x] Changing the Workspace calendar re-buckets Periods; changing display calendar only changes rendering

## Comments

Notes for later tickets:

- `PATCH /v1/workspaces/:wsId` (Admin+) takes any non-empty subset of `name`, `baseCurrency`, `calendar`, `timezone`, `moneyDisplay` (`updateWorkspaceInputSchema`). The audit row lists only the field names sent; the web form sends only changed fields. Timezones must be IANA names the runtime knows and are stored canonically (`asia/tehran` -> `Asia/Tehran`); fixed offsets like `+03:30` are refused (`canonicalTimeZone` in core).
- Base Currency is limited to `currencies` in `@daric/core` (IRR, USD, EUR); 09 can seed the currencies table from that list. Changing the Base Currency has no guard yet; once Accounts and Exchange Rates exist, a later ticket should decide what happens to them (or forbid the change).
- `money_display` (`rial` | `toman`, default `rial`) lives on `workspaces`. "In Toman display, input is x10 when stored" is for the first ticket with money input (`displayDecimals`/`parseMoney` in core already handle it).
- User preferences are columns on `users` (`display_calendar`, `digits`, `theme`; defaults `jalali`, `persian`, `system`). `GET /v1/me` returns them as `preferences: { displayCalendar, digits, theme }`; `PATCH /v1/me/preferences` changes any subset. Not Workspace-scoped, so it runs on the owner connection like the rest of `/v1/me`.
- Periods are never stored: everything buckets them at read time from the Workspace Calendar, so changing it re-buckets everything at once. Code that groups by Period (budgets, reports, the Projection, Net Worth Snapshots) must take the Workspace's `{ calendar, timeZone }`, never the User's display calendar.
- Rendering: core `displayFormatters({ locale, workspace, preferences })` gives `money`, `date`, `currentPeriod` and `period` with the right mix of Workspace and User settings; the web app gets it through `useFormatters()` (`apps/web/src/settings/settings.ts`). Every amount and date on screen should go through it. Wrap the results in `isolate()` when they go into a message.
- Web: `useSignedIn()` returns `{ me, workspace }` under `RequireSession`; the Workspace is the first one in `me` until Workspace switching exists. `useUpdatePreferences()` updates the `['me']` cache optimistically; `useUpdateWorkspace()` writes the saved Workspace back into it.
- Theme is now a User preference: signed in, the server's value wins and is copied to `localStorage` (`daric.theme`) so the inline script paints it before the next load; signed out, the choice stays per device as in 04. The header toggle and the settings page both use `useThemePreference()`.
- `ChoiceGroup` (`apps/web/src/ui/`) is the segmented radio group used by the theme toggle and the settings forms.
