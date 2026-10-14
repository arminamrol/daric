import type { Account, Budget, Category, DueOccurrence, Label, RecurringRule } from '@daric/core';
import { describe, expect, it } from 'vitest';
import {
  withWaitingAccounts,
  withWaitingBudgets,
  withWaitingCategories,
  withWaitingDue,
  withWaitingLabels,
  withWaitingRules,
} from './waiting';
import { entityKey } from './writes';
import type { QueuedWrite, WorkspaceWrite } from './writes';

const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

let seq = 0;
function entry(
  kind: 'create' | 'update' | 'delete',
  key: string,
  payload?: WorkspaceWrite,
  status: 'pending' | 'rejected' = 'pending',
): QueuedWrite {
  const common = { scope: 'ws', entityId: key, seq: ++seq, attempted: false };
  const state = status === 'pending' ? { status } : { status, reason: 'API answered 400' };
  if (kind === 'delete') return { kind, ...common, ...state } as QueuedWrite;
  if (!payload) throw new Error('payload needed');
  return kind === 'create'
    ? ({ kind, ...common, payload, ...state } as QueuedWrite)
    : ({ kind, ...common, payload, baseVersion: 1, ...state } as QueuedWrite);
}

const melli: Account = {
  id: id(1),
  name: 'Melli',
  type: 'BANK',
  class: 'ASSET',
  currency: 'IRR',
  openingBalance: 100n,
  balance: 150n,
  archived: false,
};

describe('withWaitingAccounts', () => {
  it('shows a waiting new Account last, at its opening balance, and edits in place', () => {
    const shown = withWaitingAccounts(
      [melli],
      [
        entry('create', entityKey('account', id(2)), {
          entity: 'account',
          fields: {
            name: 'Cash',
            type: 'CASH',
            class: 'ASSET',
            currency: 'IRR',
            openingBalance: 30n,
          },
        }),
        entry('update', entityKey('account', id(1)), {
          entity: 'account',
          fields: { name: 'Melli card', openingBalance: 120n },
        }),
      ],
      { includeArchived: false },
    );
    expect(shown.items).toEqual([
      // The balance moves with the opening balance.
      { ...melli, name: 'Melli card', openingBalance: 120n, balance: 170n },
      {
        id: id(2),
        name: 'Cash',
        type: 'CASH',
        class: 'ASSET',
        currency: 'IRR',
        openingBalance: 30n,
        balance: 30n,
        archived: false,
      },
    ]);
    expect([...shown.states]).toEqual([
      [id(2), 'pending'],
      [id(1), 'pending'],
    ]);
  });

  it('leaves out an Account archived while waiting, unless archived ones are asked for', () => {
    const entries = [
      entry('update', entityKey('account', id(1)), {
        entity: 'account',
        fields: { archived: true },
      }),
    ];
    expect(withWaitingAccounts([melli], entries, { includeArchived: false }).items).toEqual([]);
    expect(withWaitingAccounts([melli], entries, { includeArchived: true }).items).toEqual([
      { ...melli, archived: true },
    ]);
  });

  it('ignores the changes of other things', () => {
    const entries = [
      entry('create', entityKey('label', id(9)), { entity: 'label', fields: { name: 'x' } }),
    ];
    expect(withWaitingAccounts([melli], entries, { includeArchived: false }).items).toEqual([
      melli,
    ]);
  });
});

const category = (n: number, fields: Partial<Category> = {}): Category => ({
  id: id(n),
  kind: 'EXPENSE',
  parentId: null,
  name: `c${n}`,
  icon: 'utensils',
  color: 'red',
  position: 0,
  archived: false,
  ...fields,
});

describe('withWaitingCategories', () => {
  it('puts a new or moved Category last among its siblings, in tree order', () => {
    const food = category(1, { position: 0 });
    const home = category(2, { position: 1 });
    const bread = category(3, { parentId: id(1), position: 0 });
    const salary = category(4, { kind: 'INCOME', position: 0 });
    const shown = withWaitingCategories(
      [food, bread, home, salary],
      [
        entry('create', entityKey('category', id(5)), {
          entity: 'category',
          fields: { kind: 'EXPENSE', parentId: id(1), name: 'Milk', icon: 'coffee', color: 'blue' },
        }),
        entry('update', entityKey('category', id(2)), {
          entity: 'category',
          fields: { parentId: id(1) },
        }),
      ],
    );
    // Each kind as the API lists them: Income first.
    expect(shown.items.map((c) => [c.name, c.parentId, c.position])).toEqual([
      ['c4', null, 0],
      ['c1', null, 0],
      ['c3', id(1), 0],
      ['Milk', id(1), 1],
      ['c2', id(1), 2],
    ]);
  });

  it('applies a waiting new order', () => {
    const shown = withWaitingCategories(
      [category(1, { position: 0 }), category(2, { position: 1 })],
      [
        entry('update', entityKey('categoryOrder', 'EXPENSE:top'), {
          entity: 'categoryOrder',
          fields: { ids: [id(2), id(1)] },
        }),
      ],
    );
    expect(shown.items.map((c) => [c.id, c.position])).toEqual([
      [id(2), 0],
      [id(1), 1],
    ]);
  });
});

describe('withWaitingLabels', () => {
  it('keeps Labels by name, ignoring case', () => {
    const trip: Label = { id: id(1), name: 'trip', controllable: false, archived: false };
    const shown = withWaitingLabels(
      [trip],
      [
        entry('create', entityKey('label', id(2)), {
          entity: 'label',
          fields: { name: 'Bills', controllable: true },
        }),
      ],
    );
    expect(shown.items).toEqual([
      { id: id(2), name: 'Bills', controllable: true, archived: false },
      trip,
    ]);
  });
});

const budget: Budget = {
  id: id(1),
  categoryId: id(10),
  labelId: null,
  period: 'MONTHLY',
  amount: 1000n,
  currency: 'IRR',
  version: 1,
  progress: {
    period: { kind: 'month', year: 1405, month: 7 },
    spent: 700n,
    remaining: 300n,
    percent: 70,
    state: 'ok',
    ratesUsed: [],
    otherCurrencyExpenses: 0,
  },
};

describe('withWaitingBudgets', () => {
  const context = { currency: 'IRR', month: { kind: 'month', year: 1405, month: 7 } } as const;

  it('works out progress again with core when the limit changes, and nothing spent for a new one', () => {
    const shown = withWaitingBudgets(
      [budget],
      [
        entry('update', entityKey('budget', id(1)), { entity: 'budget', fields: { amount: 800n } }),
        entry('create', entityKey('budget', id(2)), {
          entity: 'budget',
          fields: { categoryId: id(11), period: 'YEARLY', amount: 50n },
        }),
      ],
      context,
    );
    expect(shown.items[0]?.progress).toMatchObject({
      spent: 700n,
      remaining: 100n,
      percent: 87,
      state: 'warning',
    });
    expect(shown.items[1]).toEqual({
      id: id(2),
      categoryId: id(11),
      labelId: null,
      period: 'YEARLY',
      amount: 50n,
      currency: 'IRR',
      version: 1,
      progress: {
        period: { kind: 'year', year: 1405 },
        spent: 0n,
        remaining: 50n,
        percent: 0,
        state: 'ok',
        ratesUsed: [],
        otherCurrencyExpenses: 0,
      },
    });
  });

  it('leaves out a Budget waiting to be deleted', () => {
    const shown = withWaitingBudgets(
      [budget],
      [entry('delete', entityKey('budget', id(1)))],
      context,
    );
    expect(shown.items).toEqual([]);
    expect(shown.states.get(id(1))).toBe('pending');
  });
});

describe('withWaitingRules', () => {
  it('shows a new rule with its defaults and no next occurrence yet', () => {
    const shown = withWaitingRules(
      [],
      [
        entry('create', entityKey('recurringRule', id(1)), {
          entity: 'recurringRule',
          fields: {
            name: 'Rent',
            type: 'EXPENSE',
            accountId: id(2),
            categoryId: id(3),
            amount: 5n,
            frequency: 'MONTHLY',
            startOn: '2026-10-01',
          },
        }),
      ],
    );
    expect(shown.items).toEqual<RecurringRule[]>([
      {
        id: id(1),
        name: 'Rent',
        type: 'EXPENSE',
        accountId: id(2),
        categoryId: id(3),
        amount: 5n,
        frequency: 'MONTHLY',
        interval: 1,
        startOn: '2026-10-01',
        endOn: null,
        autoPost: false,
        archived: false,
        nextDueOn: null,
        version: 1,
      },
    ]);
  });
});

describe('withWaitingDue', () => {
  it('leaves out occurrences confirmed or skipped while waiting, but not refused ones', () => {
    const due = (dueOn: string): DueOccurrence => ({
      ruleId: id(1),
      dueOn,
      name: 'Rent',
      type: 'EXPENSE',
      accountId: id(2),
      categoryId: id(3),
      amount: 5n,
    });
    const shown = withWaitingDue(
      [due('2026-08-01'), due('2026-09-01'), due('2026-10-01')],
      [
        entry('create', entityKey('occurrence', `${id(1)}:2026-08-01`), {
          entity: 'occurrence',
          fields: { ruleId: id(1), dueOn: '2026-08-01', action: 'skip' },
        }),
        entry(
          'create',
          entityKey('occurrence', `${id(1)}:2026-09-01`),
          {
            entity: 'occurrence',
            fields: { ruleId: id(1), dueOn: '2026-09-01', action: 'confirm' },
          },
          'rejected',
        ),
      ],
    );
    expect(shown.map((o) => o.dueOn)).toEqual(['2026-09-01', '2026-10-01']);
  });
});
