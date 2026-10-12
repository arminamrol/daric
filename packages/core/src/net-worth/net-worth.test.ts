import { describe, expect, it } from 'vitest';
import { EUR, IRR, USD, money } from '../money';
import { accountValue, netWorth } from './net-worth';

describe('accountValue', () => {
  const balance = money(5_000n, USD);
  const valuations = [
    { amount: 700_000n, valuedOn: '2026-09-01' },
    { amount: 900_000n, valuedOn: '2026-10-01' },
    { amount: 950_000n, valuedOn: '2026-11-01' },
  ];

  it('is the balance when the Account has no Valuation', () => {
    expect(accountValue(balance, [], '2026-10-11')).toEqual({ value: balance, valuedOn: null });
  });

  it('is the latest Valuation on or before the day, whatever the balance', () => {
    expect(accountValue(balance, valuations, '2026-10-11')).toEqual({
      value: money(900_000n, USD),
      valuedOn: '2026-10-01',
    });
    expect(accountValue(balance, valuations, '2026-10-01').valuedOn).toBe('2026-10-01');
  });

  it('is the balance before the first Valuation', () => {
    expect(accountValue(money(3n, IRR), valuations, '2026-08-31')).toEqual({
      value: money(3n, IRR),
      valuedOn: null,
    });
  });
});

describe('netWorth', () => {
  const day = '2026-10-11';
  const usdRate = { currency: 'USD', rate: '1000000', effectiveOn: '2026-10-01' };

  it('is Assets minus Liabilities, a Liability counting what is owed', () => {
    const result = netWorth(
      [
        { id: 'bank', class: 'ASSET', value: money(8_000_000n, IRR) },
        { id: 'cash', class: 'ASSET', value: money(500_000n, IRR) },
        { id: 'loan', class: 'LIABILITY', value: money(3_000_000n, IRR) },
      ],
      IRR,
      [],
      day,
    );
    expect(result.total).toEqual(money(5_500_000n, IRR));
    expect(result.assets).toEqual(money(8_500_000n, IRR));
    expect(result.liabilities).toEqual(money(3_000_000n, IRR));
    expect(result.missing).toEqual([]);
    expect(result.ratesUsed).toEqual([]);
  });

  const mixed = [
    { id: 'bank', class: 'ASSET', value: money(8_000_000n, IRR) },
    { id: 'savings', class: 'ASSET', value: money(10_000n, USD) },
    { id: 'card', class: 'LIABILITY', value: money(2_550n, USD) },
    { id: 'gold', class: 'ASSET', value: money(5_000n, EUR) },
  ] as const;

  it('converts each currency at its rate on the day, leaving out and naming one with no rate', () => {
    const result = netWorth(mixed, IRR, [usdRate], day);
    // 100.00 USD owned and 25.50 USD owed, at 1,000,000 rials each; the EUR has no rate.
    expect(result.total).toEqual(money(82_500_000n, IRR));
    expect(result.assets).toEqual(money(108_000_000n, IRR));
    expect(result.liabilities).toEqual(money(25_500_000n, IRR));
    expect(result.ratesUsed).toEqual([usdRate]);
    expect(result.missing).toEqual([EUR]);
  });

  it('breaks the totals down by currency, in each currency', () => {
    expect(netWorth(mixed, IRR, [usdRate], day).byCurrency).toEqual([
      {
        currency: EUR,
        assets: money(5_000n, EUR),
        liabilities: money(0n, EUR),
        net: money(5_000n, EUR),
      },
      {
        currency: IRR,
        assets: money(8_000_000n, IRR),
        liabilities: money(0n, IRR),
        net: money(8_000_000n, IRR),
      },
      {
        currency: USD,
        assets: money(10_000n, USD),
        liabilities: money(2_550n, USD),
        net: money(7_450n, USD),
      },
    ]);
  });

  it('gives each Account its value in the Base Currency, or none without a rate', () => {
    expect(netWorth(mixed, IRR, [usdRate], day).accounts).toEqual([
      { id: 'bank', inBase: money(8_000_000n, IRR) },
      { id: 'savings', inBase: money(100_000_000n, IRR) },
      { id: 'card', inBase: money(25_500_000n, IRR) },
      { id: 'gold', inBase: null },
    ]);
  });

  it('needs no rate for a currency whose Accounts are all at zero', () => {
    const result = netWorth(
      [
        { id: 'bank', class: 'ASSET', value: money(1_000n, IRR) },
        { id: 'empty', class: 'ASSET', value: money(0n, EUR) },
      ],
      IRR,
      [],
      day,
    );
    expect(result.total).toEqual(money(1_000n, IRR));
    expect(result.missing).toEqual([]);
    expect(result.accounts[1]).toEqual({ id: 'empty', inBase: money(0n, IRR) });
  });

  it('flags a currency whose Assets and Liabilities cancel out but cannot be converted', () => {
    const result = netWorth(
      [
        { id: 'savings', class: 'ASSET', value: money(1_000n, USD) },
        { id: 'card', class: 'LIABILITY', value: money(1_000n, USD) },
      ],
      IRR,
      [],
      day,
    );
    expect(result.total).toEqual(money(0n, IRR));
    expect(result.assets).toEqual(money(0n, IRR));
    expect(result.missing).toEqual([USD]);
  });

  it('counts an overpaid Liability as owing less, in a Base Currency other than IRR', () => {
    const irrRate = { currency: 'IRR', rate: '0.000001', effectiveOn: '2026-01-01' };
    const result = netWorth(
      [
        { id: 'cash', class: 'ASSET', value: money(1_000n, USD) },
        { id: 'card', class: 'LIABILITY', value: money(-2_000_000n, IRR) },
      ],
      USD,
      [irrRate],
      day,
    );
    // 10.00 USD plus the 2,000,000 rials (2.00 USD) the card owes back.
    expect(result.total).toEqual(money(1_200n, USD));
    expect(result.liabilities).toEqual(money(-200n, USD));
  });

  it('is zero with no Accounts', () => {
    expect(netWorth([], IRR, [], day)).toEqual({
      total: money(0n, IRR),
      assets: money(0n, IRR),
      liabilities: money(0n, IRR),
      byCurrency: [],
      accounts: [],
      ratesUsed: [],
      missing: [],
    });
  });
});
