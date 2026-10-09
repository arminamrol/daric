# 03: core: Workspace Calendar and Periods

**What to build:** Dates stored in UTC can be bucketed into Periods (months and years) of the Workspace Calendar, Jalali or Gregorian, in the Workspace timezone (ADR-0002).

**Blocked by:** 01

**Status:** in-progress

- [x] Convert between Gregorian and Jalali dates, including leap years (Esfand 29/30)
- [x] Given a UTC instant, calendar and timezone, return its month and year Period
- [x] Period start/end instants, days in month, next/previous Period, list of Periods in a year
- [x] Days remaining in current month and full months remaining in the year (inputs for the Projection)
- [x] Format dates per display calendar and digits
- [x] Tests at month and year boundaries in both calendars, including Tehran-timezone midnight edges

## Comments

Implemented in `packages/core/src/calendar/`. Notes for later tickets:

- Jalali is the arithmetic 33-year-cycle algorithm (as in jalaali-js), valid for Jalali years 1178–1633; no runtime dependency.
- Timezones come from the runtime's `Intl` data (IANA names); an unknown name throws `RangeError`. Validating the Workspace timezone on input is for 08.
- Periods are half-open: `periodStart` is local midnight of the first day (or the first instant of that day when daylight saving skips midnight), `periodEnd` is the next Period's start.
- `remainingDaysInMonth` excludes today (17 Mehr of 30 days -> 13), matching `f` in the plan's Projection example.
- `formatDate` has numeric (1405/07/17) and long (17 Mehr 1405) styles; month names will move into the i18n dictionaries if 04/33 want them there.
- `Locale`, `Digits` and `toPersianDigits` moved from `money/format.ts` to `src/locale.ts` so money and dates share them.
