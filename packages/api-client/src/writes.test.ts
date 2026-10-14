import type { CreateTransactionInput } from '@daric/core';
import type { Change } from '@daric/offline-queue';
import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import type { ApiClient } from './client';
import { entityKey, mergeWrites, parseEntityKey, workspaceTransport } from './writes';
import type { WorkspaceWrite } from './writes';

const WS = 'ws-1';
const ID = '01900000-0000-7000-8000-0000000000aa';

/** An API that records each call and answers from `answers` (a thrown ApiError, or a value). */
function fakeApi(answers: Partial<Record<keyof ApiClient, unknown>> = {}) {
  const calls: [string, ...unknown[]][] = [];
  const api = new Proxy({} as ApiClient, {
    get:
      (_, name: string) =>
      async (...args: unknown[]) => {
        calls.push([name, ...args]);
        const answer = answers[name as keyof ApiClient];
        if (answer instanceof Error) throw answer;
        return answer;
      },
  });
  return { api, calls };
}

function setup(answers?: Partial<Record<keyof ApiClient, unknown>>) {
  const { api, calls } = fakeApi(answers);
  const refreshed: string[] = [];
  const transport = workspaceTransport(api, async (workspaceId, entity) => {
    refreshed.push(`${workspaceId}:${entity}`);
  });
  return { transport, calls, refreshed };
}

const create = (entityId: string, payload: WorkspaceWrite): Change<WorkspaceWrite> => ({
  kind: 'create',
  scope: WS,
  entityId,
  payload,
});
const update = (entityId: string, payload: WorkspaceWrite): Change<WorkspaceWrite> => ({
  kind: 'update',
  scope: WS,
  entityId,
  payload,
  baseVersion: 1,
});

const expense: CreateTransactionInput = {
  type: 'EXPENSE',
  accountId: ID,
  categoryId: ID,
  amount: 100n,
  occurredOn: '2026-10-01',
  note: null,
  labelIds: [],
};

describe('entity keys', () => {
  it('know a Transaction by its bare id and anything else by its kind and id', () => {
    expect(entityKey('transaction', ID)).toBe(ID);
    expect(entityKey('budget', ID)).toBe(`budget:${ID}`);
    expect(parseEntityKey(ID)).toEqual({ entity: 'transaction', id: ID });
    expect(parseEntityKey(`budget:${ID}`)).toEqual({ entity: 'budget', id: ID });
    expect(parseEntityKey(`occurrence:${ID}:2026-10-01`)).toEqual({
      entity: 'occurrence',
      id: `${ID}:2026-10-01`,
    });
  });
});

describe('mergeWrites', () => {
  it('merges the fields of partial edits', () => {
    expect(
      mergeWrites(
        { entity: 'account', fields: { name: 'Melli', type: 'BANK' } },
        { entity: 'account', fields: { name: 'Melli card', archived: true } },
      ),
    ).toEqual({ entity: 'account', fields: { name: 'Melli card', type: 'BANK', archived: true } });
  });

  it('lets a whole Transaction or a new order replace the one before', () => {
    const later = { ...expense, amount: 5n };
    expect(mergeWrites(expense, later)).toBe(later);
    const order: WorkspaceWrite = { entity: 'categoryOrder', fields: { ids: [ID] } };
    expect(mergeWrites({ entity: 'categoryOrder', fields: { ids: [] } }, order)).toBe(order);
  });
});

describe('workspaceTransport', () => {
  it('creates under the queued id, then archives when it was archived before it was sent', async () => {
    const { transport, calls, refreshed } = setup();
    const result = await transport.send(
      create(entityKey('account', ID), {
        entity: 'account',
        fields: {
          name: 'Melli',
          type: 'BANK',
          class: 'ASSET',
          currency: 'IRR',
          openingBalance: 0n,
          archived: true,
        },
      }),
    );
    expect(result).toEqual({ status: 'done' });
    expect(calls).toEqual([
      [
        'createAccount',
        WS,
        {
          id: ID,
          name: 'Melli',
          type: 'BANK',
          class: 'ASSET',
          currency: 'IRR',
          openingBalance: 0n,
        },
      ],
      ['updateAccount', WS, ID, { archived: true }],
    ]);
    expect(refreshed).toEqual([`${WS}:account`]);
  });

  it('sends the fields an edit changed', async () => {
    const { transport, calls } = setup();
    await transport.send(
      update(entityKey('label', ID), { entity: 'label', fields: { name: 'x' } }),
    );
    await transport.send(
      update(entityKey('recurringRule', ID), { entity: 'recurringRule', fields: { amount: 5n } }),
    );
    expect(calls).toEqual([
      ['updateLabel', WS, ID, { name: 'x' }],
      ['updateRecurringRule', WS, ID, { amount: 5n }],
    ]);
  });

  it('creates Categories, Labels, Budgets and rules under their ids', async () => {
    const { transport, calls } = setup();
    await transport.send(
      create(entityKey('category', ID), {
        entity: 'category',
        fields: { kind: 'EXPENSE', parentId: null, name: 'Food', icon: 'utensils', color: 'red' },
      }),
    );
    await transport.send(
      create(entityKey('label', ID), { entity: 'label', fields: { name: 'Trip' } }),
    );
    await transport.send(
      create(entityKey('budget', ID), {
        entity: 'budget',
        fields: { categoryId: ID, labelId: null, period: 'MONTHLY', amount: 9n },
      }),
    );
    expect(calls.map(([name, , input]) => [name, (input as { id: string }).id])).toEqual([
      ['createCategory', ID],
      ['createLabel', ID],
      ['createBudget', ID],
    ]);
  });

  it('reorders Categories', async () => {
    const { transport, calls } = setup();
    await transport.send(
      update(entityKey('categoryOrder', 'EXPENSE:top'), {
        entity: 'categoryOrder',
        fields: { ids: [ID] },
      }),
    );
    expect(calls).toEqual([['reorderCategories', WS, { ids: [ID] }]]);
  });

  it('deletes a Budget, and counts one already gone as deleted', async () => {
    const { transport, calls } = setup({ deleteBudget: new ApiError(404, {}) });
    const result = await transport.send({
      kind: 'delete',
      scope: WS,
      entityId: entityKey('budget', ID),
    });
    expect(result).toEqual({ status: 'done' });
    expect(calls).toEqual([['deleteBudget', WS, ID]]);
  });

  it('confirms and skips Due Occurrences', async () => {
    const { transport, calls, refreshed } = setup();
    await transport.send(
      create(entityKey('occurrence', `${ID}:2026-10-01`), {
        entity: 'occurrence',
        fields: { ruleId: ID, dueOn: '2026-10-01', action: 'confirm', amount: 7n },
      }),
    );
    await transport.send(
      create(entityKey('occurrence', `${ID}:2026-11-01`), {
        entity: 'occurrence',
        fields: { ruleId: ID, dueOn: '2026-11-01', action: 'skip' },
      }),
    );
    expect(calls).toEqual([
      ['confirmOccurrence', WS, ID, '2026-10-01', { amount: 7n }],
      ['skipOccurrence', WS, ID, '2026-11-01'],
    ]);
    expect(refreshed).toEqual([`${WS}:occurrence`, `${WS}:occurrence`]);
  });

  it('still sends Transactions', async () => {
    const { transport, calls, refreshed } = setup();
    await transport.send(create(ID, expense));
    expect(calls).toEqual([['createTransaction', WS, { ...expense, id: ID }]]);
    expect(refreshed).toEqual([`${WS}:transaction`]);
  });

  it('drops an edit of something gone, holds a refusal and retries what may pass later', async () => {
    const gone = setup({ updateCategory: new ApiError(404, {}) });
    expect(
      await gone.transport.send(
        update(entityKey('category', ID), { entity: 'category', fields: { name: 'x' } }),
      ),
    ).toEqual({ status: 'gone' });
    expect(gone.refreshed).toEqual([]);

    const refused = setup({ createLabel: new ApiError(409, {}) });
    expect(
      await refused.transport.send(
        create(entityKey('label', ID), { entity: 'label', fields: { name: 'Trip' } }),
      ),
    ).toEqual({ status: 'rejected', reason: 'API answered 409' });

    const busy = setup({ createLabel: new ApiError(503, {}) });
    await expect(
      busy.transport.send(
        create(entityKey('label', ID), { entity: 'label', fields: { name: 'Trip' } }),
      ),
    ).rejects.toThrow(ApiError);

    const offline = setup({ createLabel: new TypeError('Failed to fetch') });
    await expect(
      offline.transport.send(
        create(entityKey('label', ID), { entity: 'label', fields: { name: 'Trip' } }),
      ),
    ).rejects.toThrow(TypeError);
  });
});
