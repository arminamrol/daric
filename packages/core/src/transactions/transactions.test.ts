import { describe, expect, it } from 'vitest';
import { IRR, USD, money } from '../money';
import { balanceEffect, groupByMonth } from './transactions';

describe('balanceEffect', () => {
  it('adds Income to an Asset and takes Expense from it', () => {
    expect(balanceEffect({ type: 'INCOME', amount: 500n }, 'ASSET')).toBe(500n);
    expect(balanceEffect({ type: 'EXPENSE', amount: 500n }, 'ASSET')).toBe(-500n);
  });

  it('makes a Liability owe more for an Expense and less for Income', () => {
    expect(balanceEffect({ type: 'EXPENSE', amount: 500n }, 'LIABILITY')).toBe(500n);
    expect(balanceEffect({ type: 'INCOME', amount: 500n }, 'LIABILITY')).toBe(-500n);
  });
});

describe('groupByMonth', () => {
  const tx = (
    id: string,
    occurredOn: string,
    type: 'INCOME' | 'EXPENSE',
    amount: bigint,
    currency = IRR,
  ) => ({
    id,
    occurredOn,
    type,
    amount,
    currency,
  });
  const currencyOf = (t: { currency: typeof IRR }) => t.currency;

  it('groups by month of the Workspace Calendar, newest first, keeping the order within a month', () => {
    const list = [
      tx('a', '2026-10-10', 'EXPENSE', 300n),
      tx('b', '2026-09-23', 'INCOME', 1000n),
      tx('c', '2026-09-22', 'EXPENSE', 50n),
      tx('d', '2026-10-01', 'EXPENSE', 200n),
    ];
    const groups = groupByMonth(list, 'jalali', currencyOf);
    expect(groups.map((g) => [g.period, g.transactions.map((t) => t.id)])).toEqual([
      [{ kind: 'month', year: 1405, month: 7 }, ['a', 'b', 'd']],
      [{ kind: 'month', year: 1405, month: 6 }, ['c']],
    ]);
    expect(groups[0]?.totals).toEqual([
      { currency: IRR, income: money(1000n, IRR), expense: money(500n, IRR) },
    ]);
  });

  it('keeps a total per currency, never adding different currencies', () => {
    const list = [
      tx('a', '2026-10-10', 'EXPENSE', 300n, USD),
      tx('b', '2026-10-09', 'EXPENSE', 7000n),
      tx('c', '2026-10-08', 'EXPENSE', 25n, USD),
    ];
    const [group] = groupByMonth(list, 'gregorian', currencyOf);
    expect(group?.totals).toEqual([
      { currency: IRR, income: money(0n, IRR), expense: money(7000n, IRR) },
      { currency: USD, income: money(0n, USD), expense: money(325n, USD) },
    ]);
  });

  it('is empty for no Transactions', () => {
    expect(groupByMonth([], 'jalali', currencyOf)).toEqual([]);
  });
});
