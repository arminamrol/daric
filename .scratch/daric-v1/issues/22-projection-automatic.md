# 22: Projection: Automatic mode

**What to build:** A user sees their projected year-end Income and Expense, computed from actuals, the Trailing Average and Recurring Rules, with every assumption shown.

**Blocked by:** 18, 19

**Status:** ready-for-agent

- [ ] core projection function per the documented algorithm in the plan, per type and per Category
- [ ] Worked example from the plan (Jalali 1405, 17 Mehr) is a passing test, plus Gregorian, short-history and no-history cases
- [ ] Projection settings (trailing months, default 3) and result API
- [ ] Web page with totals, per-Category breakdown and an assumptions panel (window months, averages, recurring list, warnings)
