# 02: core: Money

**What to build:** Every part of the system can represent, parse, format, round and convert Amounts without precision loss, so 1.02 is never treated as 1.01 (ADR-0004).

**Blocked by:** 01

**Status:** done

- [x] Amount is a bigint in the currency's minor unit; currencies declare their minor units (IRR 0, USD 2)
- [x] Parse user text input to an Amount without `parseFloat`; reject more decimals than the currency allows
- [x] Wire format is a decimal integer string; zod schema validates and transforms it
- [x] Format with Rial/Toman display, Persian or Latin digits, grouping separators, per locale
- [x] Toman input is stored x10 in rials
- [x] Convert between currencies with decimal-string rates using integer math; round half away from zero once
- [x] Sum/negate/compare helpers refuse mixed currencies
- [x] Unit tests cover edge cases (values beyond 2^53, rounding ties, mixed-currency errors)

## Comments

Implemented in `packages/core/src/money/`. Left for later tickets:

- Negative amounts format with an ASCII `-` and no bidi mark; RTL rendering of the sign is for 04 (i18n).
- English labels exist only for Rial/Toman; other currencies show their code. Currency names belong in the i18n dictionaries (04/33).
- `convert` takes rates as stored (decimal strings, units of target per one source unit); if 19 lets users type IRR rates in Toman display, that input must be scaled x10 there.
- Built-in `IRR`/`USD`/`EUR` constants stand in until the `currencies` table supplies minor units.
