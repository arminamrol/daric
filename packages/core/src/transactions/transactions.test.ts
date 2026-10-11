import { describe, expect, it } from 'vitest';
import { IRR, USD, money } from '../money';
import { balanceEffect, flowEffect, groupByMonth } from './transactions';

describe('balanceEffect', () => {
  const asset = { id: 'a', class: 'ASSET' } as const;
  const card = { id: 'c', class: 'LIABILITY' } as const;
  const other = { id: 'o', class: 'ASSET' } as const;

  it('adds Income to an Asset and takes Expense from it', () => {
    expect(balanceEffect({ type: 'INCOME', accountId: 'a', amount: 500n }, asset)).toBe(500n);
    expect(balanceEffect({ type: 'EXPENSE', accountId: 'a', amount: 500n }, asset)).toBe(-500n);
  });

  it('makes a Liability owe more for an Expense and less for Income', () => {
    expect(balanceEffect({ type: 'EXPENSE', accountId: 'c', amount: 500n }, card)).toBe(500n);
    expect(balanceEffect({ type: 'INCOME', accountId: 'c', amount: 500n }, card)).toBe(-500n);
  });

  it('takes a Transfer out of its Account and puts its destination Amount into the other', () => {
    const transfer = {
      type: 'TRANSFER',
      accountId: 'a',
      amount: 100n,
      toAccountId: 'o',
      toAmount: 5_000_000n,
    } as const;
    expect(balanceEffect(transfer, asset)).toBe(-100n);
    expect(balanceEffect(transfer, other)).toBe(5_000_000n);
  });

  it('lowers what a Liability owes when a Transfer pays it off, and raises it when drawn from', () => {
    const payOff = { type: 'TRANSFER', accountId: 'a', amount: 300n, toAccountId: 'c', toAmount: 300n } as const;
    expect(balanceEffect(payOff, card)).toBe(-300n);
    const advance = { type: 'TRANSFER', accountId: 'c', amount: 300n, toAccountId: 'a', toAmount: 300n } as const;
    expect(balanceEffect(advance, card)).toBe(300n);
  });

  it('is zero for an Account the Transaction does not touch', () => {
    expect(balanceEffect({ type: 'INCOME', accountId: 'a', amount: 500n }, other)).toBe(0n);
    const transfer = { type: 'TRANSFER', accountId: 'a', amount: 1n, toAccountId: 'c', toAmount: 1n } as const;
    expect(balanceEffect(transfer, other)).toBe(0n);
  });
});

describe('flowEffect', () => {
  it('raises an Asset for money in and lowers a Liability for it', () => {
    expect(flowEffect('IN', 7n, 'ASSET')).toBe(7n);
    expect(flowEffect('OUT', 7n, 'ASSET')).toBe(-7n);
    expect(flowEffect('IN', 7n, 'LIABILITY')).toBe(-7n);
    expect(flowEffect('OUT', 7n, 'LIABILITY')).toBe(7n);
  });
});

describe('groupByMonth', () => {
  const tx = (
    id: string,
    occurredOn: string,
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER',
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

  it('lists Transfers in their month but keeps them out of Income and Expense', () => {
    const list = [
      tx('a', '2026-10-10', 'TRANSFER', 900n),
      tx('b', '2026-10-09', 'EXPENSE', 100n),
      tx('c', '2026-10-08', 'TRANSFER', 40n, USD),
    ];
    const [group] = groupByMonth(list, 'gregorian', currencyOf);
    expect(group?.transactions.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(group?.totals).toEqual([
      { currency: IRR, income: money(0n, IRR), expense: money(100n, IRR) },
    ]);
  });

  it('is empty for no Transactions', () => {
    expect(groupByMonth([], 'jalali', currencyOf)).toEqual([]);
  });
});
