# 03: core: Workspace Calendar and Periods

**What to build:** Dates stored in UTC can be bucketed into Periods (months and years) of the Workspace Calendar, Jalali or Gregorian, in the Workspace timezone (ADR-0002).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Convert between Gregorian and Jalali dates, including leap years (Esfand 29/30)
- [ ] Given a UTC instant, calendar and timezone, return its month and year Period
- [ ] Period start/end instants, days in month, next/previous Period, list of Periods in a year
- [ ] Days remaining in current month and full months remaining in the year (inputs for the Projection)
- [ ] Format dates per display calendar and digits
- [ ] Tests at month and year boundaries in both calendars, including Tehran-timezone midnight edges
