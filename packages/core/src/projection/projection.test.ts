import { describe, expect, it } from 'vitest';
import { dayOf } from '../calendar';
import type { IsoDay } from '../calendar';
import { IRR, USD, money } from '../money';
import { projectYear } from './projection';
import type { ProjectionInput, ProjectionRule, ProjectionTransaction } from './projection';

const j = (year: number, month: number, day: number): IsoDay =>
  dayOf('jalali', { year, month, day });
const g = (year: number, month: number, day: number): IsoDay =>
  dayOf('gregorian', { year, month, day });

/** Million tomans in rials, as the plan's worked example counts. */
const mt = (millions: number) => BigInt(Math.round(millions * 10)) * 1_000_000n;

function spend(
  categoryId: string,
  occurredOn: IsoDay,
  amount: bigint,
  fields: Partial<ProjectionTransaction> = {},
): ProjectionTransaction {
  return {
    type: 'EXPENSE',
    categoryId,
    occurredOn,
    amount: money(amount, IRR),
    recurring: false,
    ...fields,
  };
}

const earn = (categoryId: string, occurredOn: IsoDay, amount: bigint, recurring = false) =>
  spend(categoryId, occurredOn, amount, { type: 'INCOME', recurring });

function rule(
  id: string,
  fields: Pick<ProjectionRule, 'type' | 'categoryId' | 'startOn'> & { amount: bigint },
): ProjectionRule {
  return {
    id,
    name: id,
    frequency: 'MONTHLY',
    interval: 1,
    endOn: null,
    ...fields,
    amount: money(fields.amount, IRR),
  };
}

function input(fields: Partial<ProjectionInput>): ProjectionInput {
  return {
    calendar: 'jalali',
    today: j(1405, 7, 17),
    trailingMonths: 3,
    base: IRR,
    rates: [],
    transactions: [],
    rules: [],
    historyFrom: j(1405, 1, 1),
    ...fields,
  };
}

describe('projectYear: the worked example (Jalali 1405, today 17 Mehr)', () => {
  const rentRule = rule('rent', {
    type: 'EXPENSE',
    categoryId: 'rent',
    startOn: j(1405, 1, 1),
    amount: mt(25),
  });
  const subscriptionRule = rule('subscription', {
    type: 'EXPENSE',
    categoryId: 'subscriptions',
    startOn: j(1405, 7, 20),
    amount: mt(0.5),
  });
  const salaryRule = rule('salary', {
    type: 'INCOME',
    categoryId: 'salary',
    startOn: j(1405, 1, 25),
    amount: mt(80),
  });

  const transactions: ProjectionTransaction[] = [
    // Rent confirmed on the 1st of Farvardin..Mehr: 7 × 25 = 175, never variable.
    ...[1, 2, 3, 4, 5, 6, 7].map((m) => spend('rent', j(1405, m, 1), mt(25), { recurring: true })),
    // Variable spending in the window: Tir 38, Mordad 42, Shahrivar 40.
    spend('groceries', j(1405, 4, 10), mt(30)),
    spend('groceries', j(1405, 4, 28), mt(8)),
    spend('groceries', j(1405, 5, 5), mt(42)),
    spend('groceries', j(1405, 6, 31), mt(40)),
    // Before the window and this month: 40 + 40 + 30 + 15 = 125.
    spend('groceries', j(1405, 1, 15), mt(40)),
    spend('groceries', j(1405, 2, 15), mt(40)),
    spend('groceries', j(1405, 3, 15), mt(30)),
    spend('groceries', j(1405, 7, 17), mt(15)),
    // Not yet happened, and Transfers: neither counts.
    spend('groceries', j(1405, 7, 18), mt(999)),
    spend('groceries', j(1405, 6, 1), mt(999), { type: 'TRANSFER', categoryId: null }),
    // Salary confirmed on the 25th of Farvardin..Shahrivar: 6 × 80 = 480.
    ...[1, 2, 3, 4, 5, 6].map((m) => earn('salary', j(1405, m, 25), mt(80), true)),
    // Variable income: Tir 10, Mordad 30, Shahrivar 20, and 60 in Farvardin.
    earn('side', j(1405, 4, 2), mt(10)),
    earn('side', j(1405, 5, 2), mt(30)),
    earn('side', j(1405, 6, 2), mt(20)),
    earn('side', j(1405, 1, 2), mt(60)),
    // Last year counts neither as actual nor, outside the window, as variable.
    spend('groceries', j(1404, 12, 1), mt(999)),
  ];

  const result = projectYear(
    input({ transactions, rules: [rentRule, subscriptionRule, salaryRule] }),
  );

  it('states the year, today and what is left of it', () => {
    expect(result.year).toBe(1405);
    expect(result.today).toBe(j(1405, 7, 17));
    expect(result.yearEnd).toBe(j(1405, 12, 29)); // 1405 is not a leap year
    expect(result.remaining).toEqual({ daysLeftInMonth: 13, daysInMonth: 30, fullMonths: 5 });
  });

  it('averages variable amounts over the three closed months before this one', () => {
    expect(result.window).toEqual([
      { kind: 'month', year: 1405, month: 4 },
      { kind: 'month', year: 1405, month: 5 },
      { kind: 'month', year: 1405, month: 6 },
    ]);
    expect(result.monthsUsed).toBe(3);
    expect(result.warnings).toEqual([]);
  });

  it('projects Expense as A + round(V × rem) + R = 765.33', () => {
    expect(result.expense).toEqual({
      actual: mt(420),
      average: mt(40),
      variable: 2_173_333_333n, // 40 × 5.4333…, rounded once
      recurring: mt(128), // rent 25 × 5 + subscription 0.5 × 6
      projected: 7_653_333_333n,
    });
  });

  it('projects Income as 1,188.67', () => {
    expect(result.income).toEqual({
      actual: mt(600),
      average: mt(20),
      variable: 1_086_666_667n,
      recurring: mt(480),
      projected: 11_886_666_667n,
    });
  });

  it('breaks each type down by Category, the totals being their sums', () => {
    const byId = Object.fromEntries(result.categories.map((c) => [c.categoryId, c]));
    expect(byId['rent']).toEqual({
      categoryId: 'rent',
      type: 'EXPENSE',
      actual: mt(175),
      average: 0n,
      variable: 0n,
      recurring: mt(125),
      projected: mt(300),
    });
    expect(byId['groceries']).toEqual({
      categoryId: 'groceries',
      type: 'EXPENSE',
      actual: mt(245),
      average: mt(40),
      variable: 2_173_333_333n,
      recurring: 0n,
      projected: mt(245) + 2_173_333_333n,
    });
    expect(byId['subscriptions']?.projected).toBe(mt(3));
    expect(byId['salary']?.projected).toBe(mt(960));
    expect(byId['side']?.projected).toBe(mt(120) + 1_086_666_667n);
    for (const type of ['INCOME', 'EXPENSE'] as const) {
      const sum = result.categories
        .filter((c) => c.type === type)
        .reduce((acc, c) => acc + c.projected, 0n);
      expect(sum).toBe(result[type === 'INCOME' ? 'income' : 'expense'].projected);
    }
  });

  it('lists each Recurring Rule with its occurrences after today', () => {
    expect(result.recurring).toEqual([
      {
        ruleId: 'rent',
        name: 'rent',
        type: 'EXPENSE',
        categoryId: 'rent',
        occurrences: [8, 9, 10, 11, 12].map((m) => j(1405, m, 1)),
        total: mt(125),
      },
      {
        ruleId: 'subscription',
        name: 'subscription',
        type: 'EXPENSE',
        categoryId: 'subscriptions',
        occurrences: [7, 8, 9, 10, 11, 12].map((m) => j(1405, m, 20)),
        total: mt(3),
      },
      {
        ruleId: 'salary',
        name: 'salary',
        type: 'INCOME',
        categoryId: 'salary',
        occurrences: [7, 8, 9, 10, 11, 12].map((m) => j(1405, m, 25)),
        total: mt(480),
      },
    ]);
  });
});

describe('projectYear', () => {
  it('works on the Gregorian calendar', () => {
    // 12 October 2026: 19 of 31 days left, November and December still to come.
    const result = projectYear(
      input({
        calendar: 'gregorian',
        today: g(2026, 10, 12),
        historyFrom: g(2026, 1, 1),
        transactions: [
          spend('food', g(2026, 7, 1), 300n),
          spend('food', g(2026, 8, 1), 300n),
          spend('food', g(2026, 9, 30), 300n),
          spend('food', g(2026, 10, 12), 50n),
        ],
        rules: [
          rule('gym', {
            type: 'EXPENSE',
            categoryId: 'gym',
            startOn: g(2026, 1, 31),
            amount: 40n,
          }),
        ],
      }),
    );
    expect(result.year).toBe(2026);
    expect(result.yearEnd).toBe(g(2026, 12, 31));
    expect(result.remaining).toEqual({ daysLeftInMonth: 19, daysInMonth: 31, fullMonths: 2 });
    expect(result.window.map((p) => p.month)).toEqual([7, 8, 9]);
    // 300 × (2 + 19/31) = 783.87 → 784; gym on 31 Oct, 30 Nov, 31 Dec.
    expect(result.expense).toEqual({
      actual: 950n,
      average: 300n,
      variable: 784n,
      recurring: 120n,
      projected: 950n + 784n + 120n,
    });
    expect(result.recurring[0]?.occurrences).toEqual([
      g(2026, 10, 31),
      g(2026, 11, 30),
      g(2026, 12, 31),
    ]);
  });

  it('averages over the months it has, with a warning, when history is short', () => {
    const result = projectYear(
      input({
        historyFrom: j(1405, 6, 20),
        transactions: [spend('food', j(1405, 6, 20), 900n)],
      }),
    );
    expect(result.monthsUsed).toBe(1);
    expect(result.expense.average).toBe(900n);
    // 900 × 163/30 = 4,890
    expect(result.expense.variable).toBe(4_890n);
    expect(result.warnings).toEqual([{ kind: 'short_history', monthsUsed: 1, monthsWanted: 3 }]);
  });

  it('projects no variable amount, with a warning, with no history before this month', () => {
    const noHistory = projectYear(input({ historyFrom: null }));
    expect(noHistory.monthsUsed).toBe(0);
    expect(noHistory.expense).toEqual({
      actual: 0n,
      average: 0n,
      variable: 0n,
      recurring: 0n,
      projected: 0n,
    });
    expect(noHistory.warnings).toEqual([{ kind: 'no_history', monthsWanted: 3 }]);

    const startedThisMonth = projectYear(
      input({
        historyFrom: j(1405, 7, 2),
        transactions: [spend('food', j(1405, 7, 2), 100n)],
      }),
    );
    expect(startedThisMonth.monthsUsed).toBe(0);
    expect(startedThisMonth.expense.projected).toBe(100n);
    expect(startedThisMonth.warnings).toEqual([{ kind: 'no_history', monthsWanted: 3 }]);
  });

  it('reaches back into the previous year for the window', () => {
    const result = projectYear(
      input({
        today: j(1405, 2, 10),
        trailingMonths: 2,
        historyFrom: j(1404, 1, 1),
        transactions: [spend('food', j(1404, 12, 5), 100n), spend('food', j(1405, 1, 5), 300n)],
      }),
    );
    expect(result.window).toEqual([
      { kind: 'month', year: 1404, month: 12 },
      { kind: 'month', year: 1405, month: 1 },
    ]);
    expect(result.expense.actual).toBe(300n);
    expect(result.expense.average).toBe(200n);
  });

  it('counts a rule only up to its end, and leaves out the rest of the year after it', () => {
    const result = projectYear(
      input({
        rules: [
          rule('loan', {
            type: 'EXPENSE',
            categoryId: 'loan',
            startOn: j(1405, 1, 5),
            amount: 10n,
          }),
        ].map((r) => ({ ...r, endOn: j(1405, 9, 5) })),
      }),
    );
    // 5 Aban and 5 Azar remain.
    expect(result.expense.recurring).toBe(20n);
  });

  it('converts other currencies into the Base Currency, flagging those with no rate', () => {
    const usdRate = { currency: 'USD', rate: '1000000', effectiveOn: j(1405, 1, 1) };
    const result = projectYear(
      input({
        rates: [usdRate],
        transactions: [
          spend('food', j(1405, 7, 1), 5_00n, { amount: money(5_00n, USD) }),
          spend('food', j(1405, 6, 1), 3_00n, { amount: money(3_00n, USD) }),
          spend('food', j(1405, 6, 1), 7n, { amount: money(7n, { code: 'EUR', minorUnits: 2 }) }),
        ],
        rules: [
          {
            ...rule('vpn', {
              type: 'EXPENSE',
              categoryId: 'vpn',
              startOn: j(1405, 1, 1),
              amount: 0n,
            }),
            amount: money(1_00n, USD),
          },
        ],
      }),
    );
    expect(result.expense.actual).toBe(8_000_000n);
    // 3,000,000 over three months, × 163/30.
    expect(result.expense.average).toBe(1_000_000n);
    expect(result.expense.variable).toBe(5_433_333n);
    expect(result.expense.recurring).toBe(5_000_000n);
    expect(result.ratesUsed).toEqual([usdRate]);
    expect(result.missing).toEqual(['EUR']);
    expect(result.warnings).toEqual([{ kind: 'missing_rates', currencies: ['EUR'] }]);
  });
});
