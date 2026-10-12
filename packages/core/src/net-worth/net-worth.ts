import type { AccountClass } from '../accounts';
import type { IsoDay } from '../calendar';
import { money } from '../money';
import type { Currency, Money } from '../money';
import { toBaseCurrency } from '../rates';
import type { ExchangeRate } from '../rates';

/** A Valuation: what an Account was worth on a day, in its own currency. */
export interface Valuation {
  readonly amount: bigint;
  readonly valuedOn: IsoDay;
}

/** What an Account counts for on a day, and the day of the Valuation it came from. */
export interface AccountValue {
  readonly value: Money;
  /** The day of the Valuation used, or null when the value is the balance. */
  readonly valuedOn: IsoDay | null;
}

/**
 * An Account's value on `day`: its latest Valuation on or before the day if it
 * has one, else its balance. `valuations` are the Account's own, in its currency.
 */
export function accountValue(
  balance: Money,
  valuations: readonly Valuation[],
  day: IsoDay,
): AccountValue {
  let latest: Valuation | undefined;
  for (const valuation of valuations) {
    if (valuation.valuedOn > day) continue;
    if (!latest || valuation.valuedOn > latest.valuedOn) latest = valuation;
  }
  return latest
    ? { value: money(latest.amount, balance.currency), valuedOn: latest.valuedOn }
    : { value: balance, valuedOn: null };
}

/** An Account as Net Worth counts it: its class and its value in its own currency. */
export interface NetWorthAccount {
  readonly id: string;
  readonly class: AccountClass;
  readonly value: Money;
}

/** Net Worth in one currency, before converting. */
export interface CurrencyNetWorth {
  readonly currency: Currency;
  readonly assets: Money;
  readonly liabilities: Money;
  /** Assets minus Liabilities. */
  readonly net: Money;
}

/** Net Worth in the Base Currency, with what went into it. */
export interface NetWorth<R extends ExchangeRate = ExchangeRate> {
  /** Assets minus Liabilities, leaving out the currencies in `missing`. */
  readonly total: Money;
  readonly assets: Money;
  /** What is owed. */
  readonly liabilities: Money;
  /** The same totals in each currency, unconverted, by currency code. */
  readonly byCurrency: CurrencyNetWorth[];
  /** Each Account's value in the Base Currency, null without a rate; in the order given. */
  readonly accounts: { readonly id: string; readonly inBase: Money | null }[];
  /** The rate each converted currency was converted at, by currency code. */
  readonly ratesUsed: R[];
  /** Currencies with something to convert but no rate on the day; the totals leave them out. */
  readonly missing: Currency[];
}

/**
 * Net Worth on `day`: the Asset Accounts' values minus the Liability Accounts'
 * values, each currency converted into `base` at its rate in force on the day.
 * Each total is rounded once (ADR-0004), so `total` may differ from `assets`
 * minus `liabilities` by a minor unit.
 */
export function netWorth<R extends ExchangeRate>(
  accounts: readonly NetWorthAccount[],
  base: Currency,
  rates: readonly R[],
  day: IsoDay,
): NetWorth<R> {
  const signed = accounts.map((a) =>
    a.class === 'ASSET' ? a.value : money(-a.value.amount, a.value.currency),
  );
  const ofClass = (accountClass: AccountClass) =>
    accounts.filter((a) => a.class === accountClass).map((a) => a.value);
  const total = toBaseCurrency(signed, base, rates, day);
  const assets = toBaseCurrency(ofClass('ASSET'), base, rates, day);
  const liabilities = toBaseCurrency(ofClass('LIABILITY'), base, rates, day);
  const all = [total, assets, liabilities];
  const byCurrency = total.byCurrency.map((net): CurrencyNetWorth => {
    const sumOf = (accountClass: AccountClass) =>
      money(
        accounts
          .filter((a) => a.class === accountClass && a.value.currency.code === net.currency.code)
          .reduce((sum, a) => sum + a.value.amount, 0n),
        net.currency,
      );
    return { currency: net.currency, assets: sumOf('ASSET'), liabilities: sumOf('LIABILITY'), net };
  });
  return {
    total: total.total,
    assets: assets.total,
    liabilities: liabilities.total,
    byCurrency,
    accounts: accounts.map((a) => {
      const converted = toBaseCurrency([a.value], base, rates, day);
      return { id: a.id, inBase: converted.missing.length > 0 ? null : converted.total };
    }),
    ratesUsed: uniqueBy(
      all.flatMap((t) => t.ratesUsed),
      (r) => r.currency,
    ),
    missing: uniqueBy(
      all.flatMap((t) => t.missing),
      (c) => c.code,
    ),
  };
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  return items.filter(
    (item, index) => items.findIndex((other) => key(other) === key(item)) === index,
  );
}
