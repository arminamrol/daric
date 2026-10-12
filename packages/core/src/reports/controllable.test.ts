import { describe, expect, it } from 'vitest';
import { dayOf } from '../calendar';
import type { IsoDay, MonthPeriod } from '../calendar';
import { IRR, USD, money } from '../money';
import type { Currency } from '../money';
import { controllableSavings, controllableSpending, DEFAULT_SAVINGS_PERCENT } from './controllable';
import type { ControllableInput } from './controllable';
import type { ReportTransaction } from './reports';
import { trendMonths } from './reports';

const j = (year: number, month: number, day: number): IsoDay =>
  dayOf('jalali', { year, month, day });

const month = (m: number, year = 1405): MonthPeriod => ({ kind: 'month', year, month: m });

function spend(
  occurredOn: IsoDay,
  amount: bigint,
  labelIds: string[],
  fields: Partial<ReportTransaction> & { currency?: Currency } = {},
): ReportTransaction {
  const { currency = IRR, ...rest } = fields;
  return {
    type: 'EXPENSE',
    categoryId: 'food',
    occurredOn,
    amount: money(amount, currency),
    labelIds,
    ...rest,
  };
}

function input(fields: Partial<ControllableInput>): ControllableInput {
  return {
    calendar: 'jalali',
    period: month(7),
    today: j(1405, 7, 17),
    base: IRR,
    rates: [],
    transactions: [],
    categories: [],
    months: [month(5), month(6), month(7)],
    controllableLabelIds: ['out', 'subs'],
    ...fields,
  };
}

describe('controllableSpending: the Period', () => {
  it('adds up Expenses carrying a Controllable Label, each once, and its share of all Expense', () => {
    const result = controllableSpending(
      input({
        transactions: [
          spend(j(1405, 7, 2), 100n, ['out']),
          spend(j(1405, 7, 3), 50n, ['out', 'subs']),
          spend(j(1405, 7, 4), 30n, ['subs', 'trip']),
          spend(j(1405, 7, 5), 820n, ['trip']),
          spend(j(1405, 7, 6), 999n, ['out'], { type: 'INCOME', categoryId: 'salary' }),
          spend(j(1405, 7, 7), 999n, ['out'], { type: 'TRANSFER', categoryId: null }),
          spend(j(1405, 6, 7), 70n, ['out']),
        ],
      }),
    );
    expect(result.expense).toBe(180n);
    expect(result.share).toBe(18);
  });

  it('breaks the total down by Controllable Label, their totals overlapping', () => {
    const result = controllableSpending(
      input({
        transactions: [
          spend(j(1405, 7, 2), 100n, ['out']),
          spend(j(1405, 7, 3), 50n, ['out', 'subs']),
          spend(j(1405, 7, 4), 30n, ['subs', 'trip']),
        ],
      }),
    );
    expect(result.labels).toEqual([
      { labelId: 'out', expense: 150n, share: 83 },
      { labelId: 'subs', expense: 80n, share: 44 },
    ]);
  });

  it('is zero when no Label is controllable', () => {
    const result = controllableSpending(
      input({
        controllableLabelIds: [],
        transactions: [spend(j(1405, 7, 2), 100n, ['out'])],
      }),
    );
    expect(result).toMatchObject({
      expense: 0n,
      share: 0,
      labels: [],
      monthlyAverage: 0n,
      monthsAveraged: 0,
      averageRunning: false,
    });
  });

  it('converts other currencies at the Period’s rate, leaving out one with no rate', () => {
    const result = controllableSpending(
      input({
        rates: [{ currency: 'USD', rate: '1000000', effectiveOn: j(1405, 1, 1) }],
        transactions: [
          spend(j(1405, 7, 2), 150n, ['out'], { currency: USD }),
          spend(j(1405, 7, 3), 500n, ['subs']),
        ],
      }),
    );
    expect(result.expense).toBe(1_500_500n);
    const unrated = controllableSpending(
      input({ transactions: [spend(j(1405, 6, 2), 150n, ['out'], { currency: USD })] }),
    );
    expect(unrated.trend[1]).toEqual({ month: month(6), expense: 0n, missing: ['USD'] });
    expect(
      controllableSpending(
        input({ transactions: [spend(j(1405, 7, 2), 150n, ['out'], { currency: USD })] }),
      ).expense,
    ).toBe(0n);
  });
});

describe('controllableSpending: trend and monthly average', () => {
  it('gives each month’s controllable Expense', () => {
    const result = controllableSpending(
      input({
        transactions: [
          spend(j(1405, 5, 10), 300n, ['out']),
          spend(j(1405, 6, 10), 100n, ['out', 'subs']),
          spend(j(1405, 6, 11), 900n, ['trip']),
          spend(j(1405, 7, 2), 40n, ['subs']),
        ],
      }),
    );
    expect(result.trend).toEqual([
      { month: month(5), expense: 300n, missing: [] },
      { month: month(6), expense: 100n, missing: [] },
      { month: month(7), expense: 40n, missing: [] },
    ]);
  });

  it('averages the closed months, leaving out the running one', () => {
    const result = controllableSpending(
      input({
        transactions: [
          spend(j(1405, 5, 10), 300n, ['out']),
          spend(j(1405, 6, 10), 101n, ['out']),
          spend(j(1405, 7, 2), 9_000n, ['subs']),
        ],
      }),
    );
    expect(result.monthlyAverage).toBe(201n);
    expect(result.monthsAveraged).toBe(2);
    expect(result.averageRunning).toBe(false);
  });

  it('starts averaging at the first month with controllable spending', () => {
    const result = controllableSpending(
      input({
        months: trendMonths(month(7), 'jalali', j(1405, 7, 17)),
        transactions: [spend(j(1405, 4, 10), 300n, ['out']), spend(j(1405, 6, 10), 600n, ['out'])],
      }),
    );
    // Tir, Mordad (nothing) and Shahrivar.
    expect(result.monthsAveraged).toBe(3);
    expect(result.monthlyAverage).toBe(300n);
  });

  it('falls back to the running month while no closed month has controllable spending', () => {
    const result = controllableSpending(
      input({ transactions: [spend(j(1405, 7, 2), 40n, ['subs'])] }),
    );
    expect(result.monthlyAverage).toBe(40n);
    expect(result.monthsAveraged).toBe(1);
    expect(result.averageRunning).toBe(true);
  });

  it('averages a closed year over its months from the first with controllable spending', () => {
    const result = controllableSpending(
      input({
        period: { kind: 'year', year: 1404 },
        months: trendMonths({ kind: 'year', year: 1404 }, 'jalali', j(1405, 7, 17)),
        transactions: [spend(j(1404, 11, 1), 500n, ['out']), spend(j(1404, 12, 1), 100n, ['out'])],
      }),
    );
    expect(result.expense).toBe(600n);
    expect(result.monthsAveraged).toBe(2);
    expect(result.monthlyAverage).toBe(300n);
  });
});

describe('controllableSavings', () => {
  it('defaults to 20%', () => {
    expect(DEFAULT_SAVINGS_PERCENT).toBe(20);
  });

  it('is the percent of the monthly average, a month and a year, each rounded once', () => {
    expect(controllableSavings(1_000_005n, 20)).toEqual({ monthly: 200_001n, yearly: 2_400_012n });
    expect(controllableSavings(7n, 10)).toEqual({ monthly: 1n, yearly: 8n });
  });

  it('is nothing at 0% and everything at 100%', () => {
    expect(controllableSavings(500n, 0)).toEqual({ monthly: 0n, yearly: 0n });
    expect(controllableSavings(500n, 100)).toEqual({ monthly: 500n, yearly: 6_000n });
  });

  it('refuses a percent that is not a whole number from 0 to 100', () => {
    expect(() => controllableSavings(500n, -1)).toThrow(RangeError);
    expect(() => controllableSavings(500n, 101)).toThrow(RangeError);
    expect(() => controllableSavings(500n, 12.5)).toThrow(RangeError);
  });
});
