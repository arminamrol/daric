# Money is a bigint in the currency's minor unit, a string on the wire

Every amount is an integer count of its currency's minor unit (the currency record says how many decimals it has: IRR 0, USD 2). In code money is `bigint`, in Postgres `bigint`, and in JSON a decimal integer string (`"1299"`), because JS `number` loses precision and floats misround (1.02 must never become 1.01). User input is parsed from text, never via `parseFloat`. Exchange rates are decimal strings and conversion is done with integer math in `packages/core`, rounding once at the end.
