# 19: Exchange Rates

**What to build:** A user enters Exchange Rates to the Base Currency, and every total shows its Base Currency value with the rate used beneath it alongside per-currency totals.

**Blocked by:** 09, 02

**Status:** done

- [x] Exchange rates API with effective dates; rate lookup = latest on or before a date
- [x] core conversion of mixed-currency totals with a list of rates used and missing-rate warnings
- [x] Rates screen on web; totals UI shows rate used and per-currency breakdown
- [x] Tests for lookup and missing-rate behaviour

## Comments

Notes for later tickets:

- Table `exchange_rates` in `0010_exchange_rates.sql`: `currency`, `base_currency` (the Base Currency when entered), `rate` `numeric(30, 12)` (> 0), `effective_on`, `version`. Unique `exchange_rates_currency_day_key` on `(workspace_id, base_currency, currency, effective_on)`; check `currency <> base_currency`. Deleted outright (DELETE grant). Changing the Workspace's Base Currency leaves old rates stored but unused; every read filters by the current Base Currency, and the API answers 404 for an old one.
- A rate is units of the Base Currency per one unit of `currency`, major unit to major unit, as core `convert` takes it. On the wire it is a decimal string (`rateSchema`: ≤ 18 whole digits, ≤ 12 decimals, positive, needless zeros dropped by `canonicalRate`). Postgres pads `numeric` to 12 decimals, so the API canonicalises on read.
- Core `rates/`: `rateOn(rates, currency, day)` (latest on or before), `toBaseCurrency(amounts, base, rates, day)` → `{ total, byCurrency, ratesUsed, missing }` (each currency's sum converted exactly with `convertExactly` and the total rounded once, half away from zero, per ADR-0004; a currency with no rate is left out of `total` and listed in `missing`; one that sums to zero needs no rate), `rateDayOf(period, calendar, today)` (Period's last day, or today while it runs), `parseRate` / `formatRate` (Toman display: a rate into IRR is typed in tomans and stored ×10; a rate of IRR is per toman). Also `currencyByCode(code)` (throws on unknown), `currencyName`, and `currency` / `rate` in `displayFormatters`. **For 20/21/24:** use `toBaseCurrency` with `rateDayOf`; for Net Worth "today" is the day.
- API under `/v1/workspaces/:wsId/exchange-rates`: `GET` (current Base Currency only, by currency, newest first), `POST` (Admin+; 400 for the Base Currency itself; 409 for a second rate of a currency on one day), `PATCH /:id` (`rate` and/or `effectiveOn`; the currency is fixed), `DELETE /:id`. `ratesInto(baseCurrency)` in `exchange-rates.service.ts` reads them for other services.
- Budgets now convert: a Budget in the current Base Currency counts Expenses in other currencies at the rate on its Period's last day (or today). `progress.ratesUsed` lists the rates, and `otherCurrencyExpenses` counts only Expenses still left out (no rate, or any Expense in another currency on a Budget made in a former Base Currency).
- Audit: `exchange_rate.create` / `.update` (`exchangeRateId`, `fields`) / `.delete`. Never rates.
- Web: `/rates` (grouped by currency, newest first, "today's rate" marked), `/rates/new` and `/rates/:rateId` (Admin+). Month totals on `/transactions` show Income and Expense in the Base Currency once any other currency appears, with each currency's totals, the rates used and a warning (with a link to add a rate for Admins) per missing currency (`rates/PeriodTotals.tsx`, `rates/RateNotes.tsx`). Budget cards name the rates used. Hooks in `apps/web/src/rates/rates.ts`; a rate change refetches Budgets.
- Demo seed: a dollar rate from the first of each demo month, ending at 1,050,000 rials.
- Open points from review: the Rates form lists core's `currencies`, not a `currencies` endpoint (plan.md names one). Create takes no client id and PATCH does not check `version` (as Budgets; ADR-0005). Budget cards say only that some currency lacks a rate, not which. If the rates request fails, month totals fall back to per-currency totals without a warning. The form-field helper is now copied in `RateForm` too (after `RecurringForm`). Admin+ for rates follows the plan's roles row for Accounts and Budgets; the plan has no row for rates.
