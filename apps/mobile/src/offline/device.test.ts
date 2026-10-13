import type { ApiClient } from '@daric/api-client';
import type { CreateTransactionInput } from '@daric/core';
import { memoryKeyValueStore } from '@daric/offline-queue';
import type { KeyValueStore } from '@daric/offline-queue';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { memorySettings } from '../storage/settings';
import type { Settings } from '../storage/settings';
import { createOfflineDevice } from './device';
import type { Network } from './network';

const workspaceId = '01900000-0000-7000-9000-000000000001';
const expense: CreateTransactionInput = {
  type: 'EXPENSE',
  accountId: '01900000-0000-7000-8000-0000000000a1',
  categoryId: '01900000-0000-7000-8000-0000000000c1',
  amount: 250_000n,
  occurredOn: '2026-10-13',
  note: null,
  labelIds: [],
};

/** A network that is up or down, telling the device when it comes back. */
function fakeNetwork(online: boolean): Network & { goOnline(): void } {
  const listeners = new Set<() => void>();
  return {
    isOnline: () => online,
    subscribe(onOnline) {
      listeners.add(onOnline);
      return () => listeners.delete(onOnline);
    },
    goOnline() {
      online = true;
      for (const listener of listeners) listener();
    },
  };
}

function fakeApi() {
  const created: CreateTransactionInput[] = [];
  const api = {
    createTransaction: vi.fn(async (_workspaceId: string, input: CreateTransactionInput) => {
      created.push(input);
      return input;
    }),
  } as unknown as ApiClient;
  return { api, created };
}

/** A device on this phone; `store` and `settings` outlive it, as the app's storage does. */
function device({
  store = memoryKeyValueStore(),
  settings = memorySettings(),
  network = fakeNetwork(false),
  api = fakeApi().api,
  queryClient = new QueryClient(),
}: {
  store?: KeyValueStore;
  settings?: Settings;
  network?: Network;
  api?: ApiClient;
  queryClient?: QueryClient;
} = {}) {
  return createOfflineDevice({ api, queryClient, store, settings, network });
}

const create = (id: string) =>
  ({ kind: 'create', scope: workspaceId, entityId: id, payload: { ...expense, id } }) as const;

describe('the offline device', () => {
  it('keeps nothing until the user says yes at login', async () => {
    const store = memoryKeyValueStore();
    const phone = device({ store });
    expect(phone.keeps()).toBe(false);
    await phone.queue.submit(create('t1'));
    expect(await store.get('entries')).toBeUndefined();
  });

  it('keeps waiting changes on the phone once it is an Offline Device, for the next app start', async () => {
    const store = memoryKeyValueStore();
    const settings = memorySettings();
    const phone = device({ store, settings });
    await phone.setKeep(true);
    expect(await phone.queue.submit(create('t1'))).toEqual({ status: 'queued' });

    const restarted = device({ store, settings });
    expect(restarted.keeps()).toBe(true);
    await vi.waitFor(() => expect(restarted.queue.entries()).toHaveLength(1));
    expect(restarted.queue.entries()[0]).toMatchObject({ payload: { amount: 250_000n } });
  });

  it('writes changes made before the answer once the answer is yes', async () => {
    const store = memoryKeyValueStore();
    const phone = device({ store });
    await phone.queue.submit(create('t1'));
    await phone.setKeep(true);
    expect(await store.get('entries')).toHaveLength(1);
  });

  it('keeps the data it loaded and gives it back at the next start, Amounts as bigints', async () => {
    const store = memoryKeyValueStore();
    const settings = memorySettings();
    const queryClient = new QueryClient();
    const phone = device({ store, settings, queryClient });
    await phone.setKeep(true);
    queryClient.setQueryData(['transactions', workspaceId], [{ id: 't1', amount: 9n }]);
    await vi.waitFor(async () => expect(await store.get('queryCache')).toBeDefined());

    const later = new QueryClient();
    await device({ store, settings, queryClient: later }).restore();
    expect(later.getQueryData(['transactions', workspaceId])).toEqual([{ id: 't1', amount: 9n }]);
  });

  it('restores nothing on a phone that keeps no data', async () => {
    const store = memoryKeyValueStore();
    await store.set('queryCache', { version: 1, state: { queries: [], mutations: [] } });
    const queryClient = new QueryClient();
    await device({ store, queryClient }).restore();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('forgets what an earlier yes kept when the answer is now no', async () => {
    const store = memoryKeyValueStore();
    const settings = memorySettings();
    const phone = device({ store, settings });
    await phone.setKeep(true);
    await phone.queue.submit(create('t1'));
    await device({ store, settings }).setKeep(false);
    expect(await store.get('entries')).toBeUndefined();
    expect(await store.get('queryCache')).toBeUndefined();
  });

  it('wipes the waiting changes, the kept data, the answer and the last picks on logout', async () => {
    const store = memoryKeyValueStore();
    const settings = memorySettings();
    settings.set(`daric.lastPicks.${workspaceId}`, '{}');
    const phone = device({ store, settings });
    await phone.setKeep(true);
    await phone.queue.submit(create('t1'));

    await phone.wipe();
    expect(phone.keeps()).toBe(false);
    expect(phone.queue.entries()).toHaveLength(0);
    expect(await store.get('entries')).toBeUndefined();
    expect(await store.get('queryCache')).toBeUndefined();
    expect(settings.keys()).toEqual([]);
  });

  it('sends what waits when the phone comes back online', async () => {
    const network = fakeNetwork(false);
    const { api, created } = fakeApi();
    const phone = device({ network, api });
    await phone.queue.submit(create('t1'));
    const stop = phone.start();
    await phone.queue.replay(); // the try made at start, while offline
    expect(created).toHaveLength(0);

    network.goOnline();
    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(phone.queue.entries()).toHaveLength(0);
    stop();
  });

  it("wipes what another User's lapsed session left before a new User keeps data", async () => {
    const store = memoryKeyValueStore();
    const settings = memorySettings();
    const queryClient = new QueryClient();
    const phone = device({ store, settings, queryClient });
    await phone.signedIn('user-a', true);
    await phone.queue.submit(create('t1'));
    queryClient.setQueryData(['transactions', workspaceId], [{ id: 't1' }]);

    // User A's session lapsed (no logout); User B signs in on the same phone.
    await phone.signedIn('user-b', true);
    expect(phone.queue.entries()).toHaveLength(0);
    expect(queryClient.getQueryData(['transactions', workspaceId])).toBeUndefined();
    expect(await store.get('entries')).toEqual([]);
  });

  it('keeps what waits when the same User signs in again after their session lapsed', async () => {
    const settings = memorySettings();
    const phone = device({ settings });
    await phone.signedIn('user-a', true);
    await phone.queue.submit(create('t1'));
    await phone.signedIn('user-a', true);
    expect(phone.queue.entries()).toHaveLength(1);
  });
});
