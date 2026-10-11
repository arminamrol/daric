import { describe, expect, it } from 'vitest';
import { budgetExpenses, budgetPeriodOf, budgetProgress, budgetSpent } from './budgets';

describe('budgetProgress', () => {
  it('is ok below 80%, with what is left', () => {
    expect(budgetProgress(1000n, 799n)).toEqual({
      spent: 799n,
      remaining: 201n,
      percent: 79,
      state: 'ok',
    });
    expect(budgetProgress(1000n, 0n)).toMatchObject({ remaining: 1000n, percent: 0, state: 'ok' });
  });

  it('warns from 80% up to and including 100%', () => {
    expect(budgetProgress(1000n, 800n)).toMatchObject({ percent: 80, state: 'warning' });
    expect(budgetProgress(1000n, 1000n)).toMatchObject({
      remaining: 0n,
      percent: 100,
      state: 'warning',
    });
  });

  it('is overspent above 100%, with a negative remainder', () => {
    expect(budgetProgress(1000n, 1001n)).toEqual({
      spent: 1001n,
      remaining: -1n,
      percent: 100,
      state: 'over',
    });
    expect(budgetProgress(1000n, 2500n)).toMatchObject({ percent: 250, state: 'over' });
  });

  it('rounds the percent down, so a warning never shows below 80', () => {
    expect(budgetProgress(3n, 2n)).toMatchObject({ percent: 66, state: 'ok' });
    expect(budgetProgress(1_000_000n, 799_999n)).toMatchObject({ percent: 79, state: 'ok' });
  });

  it('works with Amounts beyond what a float holds exactly', () => {
    const limit = 9_000_000_000_000_000_000n;
    expect(budgetProgress(limit, limit - 1n)).toMatchObject({ percent: 99, state: 'warning' });
  });

  it('refuses a limit that is not positive', () => {
    expect(() => budgetProgress(0n, 0n)).toThrow(RangeError);
  });
});

describe('budgetPeriodOf', () => {
  it('is the month or the year of the Workspace Calendar that holds the day', () => {
    // 2026-10-11 is 19 Mehr 1405.
    expect(budgetPeriodOf('MONTHLY', '2026-10-11', 'jalali')).toEqual({
      kind: 'month',
      year: 1405,
      month: 7,
    });
    expect(budgetPeriodOf('YEARLY', '2026-10-11', 'jalali')).toEqual({ kind: 'year', year: 1405 });
    expect(budgetPeriodOf('YEARLY', '2026-03-20', 'jalali')).toEqual({ kind: 'year', year: 1404 });
    expect(budgetPeriodOf('MONTHLY', '2026-10-11', 'gregorian')).toEqual({
      kind: 'month',
      year: 2026,
      month: 10,
    });
  });
});

describe('budgetSpent', () => {
  const categories = [
    { id: 'food', kind: 'EXPENSE', parentId: null },
    { id: 'groceries', kind: 'EXPENSE', parentId: 'food' },
    { id: 'cafe', kind: 'EXPENSE', parentId: 'food' },
    { id: 'rent', kind: 'EXPENSE', parentId: null },
  ] as const;
  // Mehr 1405 runs from 2026-09-23 to 2026-10-22.
  const mehr = { kind: 'month', year: 1405, month: 7 } as const;
  const expense = (
    categoryId: string,
    amount: bigint,
    occurredOn = '2026-10-01',
    labelIds: readonly string[] = [],
  ) => ({ type: 'EXPENSE', categoryId, amount, occurredOn, labelIds }) as const;

  const spent = (
    budget: { categoryId: string; labelId: string | null },
    transactions: Parameters<typeof budgetSpent>[1],
  ) => budgetSpent({ budget, period: mehr, calendar: 'jalali', categories }, transactions);

  it('adds the Expenses of the Category in the Period', () => {
    expect(spent({ categoryId: 'rent', labelId: null }, [expense('rent', 700n)])).toBe(700n);
  });

  it("includes a parent Category's children", () => {
    const transactions = [
      expense('food', 100n),
      expense('groceries', 200n),
      expense('cafe', 300n),
      expense('rent', 5000n),
    ];
    expect(spent({ categoryId: 'food', labelId: null }, transactions)).toBe(600n);
    expect(spent({ categoryId: 'cafe', labelId: null }, transactions)).toBe(300n);
  });

  it('leaves out days outside the Period', () => {
    const transactions = [
      expense('rent', 1n, '2026-09-22'),
      expense('rent', 10n, '2026-09-23'),
      expense('rent', 100n, '2026-10-22'),
      expense('rent', 1000n, '2026-10-23'),
    ];
    expect(spent({ categoryId: 'rent', labelId: null }, transactions)).toBe(110n);
  });

  it('counts a whole year for a yearly Period', () => {
    const transactions = [expense('rent', 10n, '2026-03-21'), expense('rent', 100n, '2027-03-20')];
    const yearly = budgetSpent(
      {
        budget: { categoryId: 'rent', labelId: null },
        period: { kind: 'year', year: 1405 },
        calendar: 'jalali',
        categories,
      },
      transactions,
    );
    expect(yearly).toBe(110n);
  });

  it('narrows to Expenses carrying the Label when the Budget has one', () => {
    const transactions = [
      expense('cafe', 100n, '2026-10-01', ['eating-out', 'friends']),
      expense('cafe', 200n, '2026-10-01', ['friends']),
      expense('groceries', 400n, '2026-10-01', ['eating-out']),
    ];
    expect(spent({ categoryId: 'food', labelId: 'eating-out' }, transactions)).toBe(500n);
    expect(spent({ categoryId: 'cafe', labelId: 'eating-out' }, transactions)).toBe(100n);
  });

  it('leaves out Income and Transfers', () => {
    const transactions = [
      expense('rent', 100n),
      { type: 'INCOME', categoryId: 'rent', amount: 50n, occurredOn: '2026-10-01', labelIds: [] },
      { type: 'TRANSFER', amount: 70n, occurredOn: '2026-10-01', labelIds: [] },
    ] as const;
    expect(spent({ categoryId: 'rent', labelId: null }, transactions)).toBe(100n);
  });

  it('lists the Expenses it counts, so callers can tell them apart', () => {
    const counted = expense('rent', 100n);
    const listed = budgetExpenses(
      {
        budget: { categoryId: 'rent', labelId: null },
        period: mehr,
        calendar: 'jalali',
        categories,
      },
      [counted, expense('food', 5n)],
    );
    expect(listed).toEqual([counted]);
  });
});
