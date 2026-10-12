import { describe, expect, it } from 'vitest';
import { dayOf } from '../calendar';
import type { IsoDay, MonthPeriod, Period } from '../calendar';
import { IRR, USD, money } from '../money';
import type { Currency } from '../money';
import { periodReport, trendMonths, trendReport } from './reports';
import type { ReportInput, ReportTransaction } from './reports';

const j = (year: number, month: number, day: number): IsoDay =>
  dayOf('jalali', { year, month, day });

const mehr: MonthPeriod = { kind: 'month', year: 1405, month: 7 };

function spend(
  categoryId: string | null,
  occurredOn: IsoDay,
  amount: bigint,
  fields: Partial<ReportTransaction> & { currency?: Currency } = {},
): ReportTransaction {
  const { currency = IRR, ...rest } = fields;
  return {
    type: 'EXPENSE',
    categoryId,
    occurredOn,
    amount: money(amount, currency),
    labelIds: [],
    ...rest,
  };
}

const earn = (categoryId: string, occurredOn: IsoDay, amount: bigint) =>
  spend(categoryId, occurredOn, amount, { type: 'INCOME' });

function input<F extends Partial<ReportInput> & { months?: readonly MonthPeriod[] }>(
  fields: F,
): ReportInput & { months: readonly MonthPeriod[] } {
  return {
    calendar: 'jalali',
    period: mehr,
    today: j(1405, 7, 17),
    base: IRR,
    rates: [],
    transactions: [],
    categories: [],
    months: [],
    ...fields,
  };
}

describe('periodReport: summary', () => {
  it('adds up the Period’s Income and Expense, leaving out Transfers and other Periods', () => {
    const report = periodReport(
      input({
        transactions: [
          earn('salary', j(1405, 7, 1), 800n),
          spend('food', j(1405, 7, 3), 120n),
          spend('food', j(1405, 7, 30), 80n),
          spend(null, j(1405, 7, 5), 999n, { type: 'TRANSFER' }),
          spend('food', j(1405, 6, 31), 50n),
          spend('food', j(1405, 8, 1), 70n),
        ],
      }),
    );
    expect(report.income).toBe(800n);
    expect(report.expense).toBe(200n);
    expect(report.net).toBe(600n);
    expect(report.from).toBe(j(1405, 7, 1));
    expect(report.to).toBe(j(1405, 7, 30));
  });
});

describe('periodReport: currencies', () => {
  const usd = (day: IsoDay, rate: string) => ({ currency: 'USD', rate, effectiveOn: day });

  it('converts at the rate on the Period’s last day, or today while it runs', () => {
    const rates = [usd(j(1405, 6, 1), '900000'), usd(j(1405, 6, 20), '1000000')];
    const transactions = [spend('food', j(1405, 6, 10), 150n, { currency: USD })];
    const shahrivar: Period = { kind: 'month', year: 1405, month: 6 };
    const closed = periodReport(input({ period: shahrivar, rates, transactions }));
    expect(closed.rateDay).toBe(j(1405, 6, 31));
    expect(closed.expense).toBe(1_500_000n);
    expect(closed.ratesUsed).toEqual([rates[1]]);

    const running = periodReport(
      input({ period: shahrivar, today: j(1405, 6, 15), rates, transactions }),
    );
    expect(running.rateDay).toBe(j(1405, 6, 15));
    expect(running.expense).toBe(1_350_000n);
  });

  it('leaves out a currency with no rate and lists it as missing', () => {
    const report = periodReport(
      input({
        transactions: [
          spend('food', j(1405, 7, 3), 120n),
          spend('food', j(1405, 7, 4), 5n, { currency: USD }),
        ],
      }),
    );
    expect(report.expense).toBe(120n);
    expect(report.missing).toEqual(['USD']);
    expect(report.ratesUsed).toEqual([]);
  });
});

describe('periodReport: Category breakdown', () => {
  const categories = [
    { id: 'food', kind: 'EXPENSE', parentId: null },
    { id: 'groceries', kind: 'EXPENSE', parentId: 'food' },
    { id: 'cafe', kind: 'EXPENSE', parentId: 'food' },
    { id: 'rent', kind: 'EXPENSE', parentId: null },
    { id: 'salary', kind: 'INCOME', parentId: null },
  ] as const;

  it('folds children into their parent, largest first, with each one’s share of its type', () => {
    const report = periodReport(
      input({
        categories,
        transactions: [
          spend('food', j(1405, 7, 2), 50n),
          spend('groceries', j(1405, 7, 3), 300n),
          spend('cafe', j(1405, 7, 4), 100n),
          spend('cafe', j(1405, 7, 5), 50n),
          spend('rent', j(1405, 7, 1), 1500n),
          earn('salary', j(1405, 7, 1), 3000n),
        ],
      }),
    );
    expect(report.expense).toBe(2000n);
    expect(report.categories).toEqual([
      { categoryId: 'salary', type: 'INCOME', total: 3000n, own: 3000n, share: 100, children: [] },
      { categoryId: 'rent', type: 'EXPENSE', total: 1500n, own: 1500n, share: 75, children: [] },
      {
        categoryId: 'food',
        type: 'EXPENSE',
        total: 500n,
        own: 50n,
        share: 25,
        children: [
          { categoryId: 'groceries', total: 300n, share: 15 },
          { categoryId: 'cafe', total: 150n, share: 8 },
        ],
      },
    ]);
  });

  it('shows a Category missing from the list on its own line', () => {
    const report = periodReport(
      input({ categories, transactions: [spend('gone', j(1405, 7, 2), 10n)] }),
    );
    expect(report.categories).toEqual([
      { categoryId: 'gone', type: 'EXPENSE', total: 10n, own: 10n, share: 100, children: [] },
    ]);
  });
});

describe('periodReport: Label breakdown', () => {
  it('counts a Transaction under each of its Labels, and the rest as unlabeled', () => {
    const report = periodReport(
      input({
        transactions: [
          spend('food', j(1405, 7, 2), 300n, { labelIds: ['out', 'friends'] }),
          spend('food', j(1405, 7, 3), 100n, { labelIds: ['out'] }),
          spend('rent', j(1405, 7, 1), 600n),
          earn('salary', j(1405, 7, 1), 2000n),
          spend('food', j(1405, 7, 4), 999n, { type: 'TRANSFER', labelIds: ['out'] }),
          spend('food', j(1405, 6, 4), 999n, { labelIds: ['out'] }),
          { ...earn('gift', j(1405, 7, 9), 500n), labelIds: ['friends'] },
        ],
      }),
    );
    expect(report.labels).toEqual([
      { labelId: 'out', income: 0n, expense: 400n, incomeShare: 0, expenseShare: 40 },
      { labelId: 'friends', income: 500n, expense: 300n, incomeShare: 20, expenseShare: 30 },
    ]);
    expect(report.unlabeled).toEqual({ income: 2000n, expense: 600n });
  });
});

describe('trendMonths', () => {
  const m = (year: number, month: number) => ({ kind: 'month', year, month }) as const;

  it('is the twelve months up to a month, reaching into last year', () => {
    const months = trendMonths(m(1405, 4), 'jalali', j(1405, 7, 17));
    expect(months[0]).toEqual(m(1404, 5));
    expect(months[11]).toEqual(m(1405, 4));
    expect(months).toHaveLength(12);
  });

  it('is a year’s months, leaving out those not yet started', () => {
    const months = trendMonths({ kind: 'year', year: 1405 }, 'jalali', j(1405, 7, 17));
    expect(months).toEqual([1, 2, 3, 4, 5, 6, 7].map((month) => m(1405, month)));
    expect(trendMonths({ kind: 'year', year: 1404 }, 'jalali', j(1405, 7, 17))).toHaveLength(12);
  });
});

describe('trendReport', () => {
  it('gives each month’s Income, Expense and net, converted at that month’s rate', () => {
    const rates = [
      { currency: 'USD', rate: '900000', effectiveOn: j(1405, 5, 1) },
      { currency: 'USD', rate: '1000000', effectiveOn: j(1405, 7, 1) },
    ];
    const trend = trendReport(
      input({
        rates,
        transactions: [
          earn('salary', j(1405, 4, 25), 800n),
          spend('food', j(1405, 4, 3), 900n),
          spend('food', j(1405, 4, 9), 3n, { currency: USD }),
          spend('food', j(1405, 5, 3), 200n, { currency: USD }),
          spend('food', j(1405, 6, 3), 100n, { currency: USD }),
          spend('food', j(1405, 6, 9), 100n, { type: 'TRANSFER', categoryId: null }),
          spend('food', j(1405, 7, 3), 100n, { currency: USD }),
        ],
        months: [4, 5, 6, 7].map((month) => ({ kind: 'month', year: 1405, month }) as const),
      }),
    );
    expect(trend).toEqual([
      {
        month: { kind: 'month', year: 1405, month: 4 },
        income: 800n,
        expense: 900n,
        net: -100n,
        missing: ['USD'],
      },
      {
        month: { kind: 'month', year: 1405, month: 5 },
        income: 0n,
        expense: 1_800_000n,
        net: -1_800_000n,
        missing: [],
      },
      {
        month: { kind: 'month', year: 1405, month: 6 },
        income: 0n,
        expense: 900_000n,
        net: -900_000n,
        missing: [],
      },
      {
        month: { kind: 'month', year: 1405, month: 7 },
        income: 0n,
        expense: 1_000_000n,
        net: -1_000_000n,
        missing: [],
      },
    ]);
  });

  it('matches the Period report of each month', () => {
    const transactions = [
      spend('food', j(1405, 7, 3), 1n, { currency: USD }),
      earn('salary', j(1405, 7, 1), 5n),
    ];
    const rates = [{ currency: 'USD', rate: '1.5', effectiveOn: j(1405, 1, 1) }];
    const [point] = trendReport(input({ rates, transactions, months: [mehr] }));
    const report = periodReport(input({ rates, transactions }));
    expect(point).toMatchObject({
      income: report.income,
      expense: report.expense,
      net: report.net,
    });
  });
});
