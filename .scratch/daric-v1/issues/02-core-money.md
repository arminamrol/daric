# 02: core: Money

**What to build:** Every part of the system can represent, parse, format, round and convert Amounts without precision loss, so 1.02 is never treated as 1.01 (ADR-0004).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Amount is a bigint in the currency's minor unit; currencies declare their minor units (IRR 0, USD 2)
- [ ] Parse user text input to an Amount without `parseFloat`; reject more decimals than the currency allows
- [ ] Wire format is a decimal integer string; zod schema validates and transforms it
- [ ] Format with Rial/Toman display, Persian or Latin digits, grouping separators, per locale
- [ ] Toman input is stored x10 in rials
- [ ] Convert between currencies with decimal-string rates using integer math; round half away from zero once
- [ ] Sum/negate/compare helpers refuse mixed currencies
- [ ] Unit tests cover edge cases (values beyond 2^53, rounding ties, mixed-currency errors)
