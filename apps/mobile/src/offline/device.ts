import { transactionTransport } from '@daric/api-client';
import type { ApiClient } from '@daric/api-client';
import type { CreateTransactionInput, Transaction } from '@daric/core';
import { createOfflineQueue, keyValueStorage, memoryStorage } from '@daric/offline-queue';
import type { KeyValueStore, OfflineQueue, QueueStorage } from '@daric/offline-queue';
import { dehydrate, hydrate } from '@tanstack/react-query';
import type { DehydratedState, QueryClient } from '@tanstack/react-query';
import type { Settings } from '../storage/settings';
import { refreshAfterChange } from '../transactions/keys';
import { forgetLastPicks } from '../transactions/last-picks';
import type { Network } from './network';

export type TransactionQueue = OfflineQueue<CreateTransactionInput, Transaction>;

/** Whether this phone is an Offline Device; asked at login, yes unless the user says no. */
const KEEP = 'daric.keepData';
/** The User whose data the phone holds, so another User's login starts clean. */
const OWNER = 'daric.dataOwner';
const CACHE_KEY = 'queryCache';
/** Bumped when the cached shapes change, so an old cache is not restored. */
const CACHE_VERSION = 1;
/** How often waiting changes are retried while online, after the server failed them. */
const RETRY_EVERY = 30_000;

interface SavedCache {
  version: number;
  state: DehydratedState;
}

/**
 * Offline support for this phone (ADR-0005). The write queue always runs, so
 * changes made without a connection are sent later; but the queue and the
 * TanStack Query cache are written to SQLite only on an Offline Device, and
 * everything is wiped on logout.
 */
export interface OfflineDevice {
  queue: TransactionQueue;
  /** Whether Workspace data is kept on this phone. */
  keeps(): boolean;
  /**
   * After a login: wipes what another User left (their session lapsed without
   * a logout), then records the answer to "Keep data on this device?".
   */
  signedIn(userId: string, keep: boolean): Promise<void>;
  /** Records the answer to "Keep data on this device?". */
  setKeep(keep: boolean): Promise<void>;
  /** Restores the cache an earlier start kept, if any. */
  restore(): Promise<void>;
  /** Starts sending what waits, now and whenever the phone comes back online. */
  start(): () => void;
  /**
   * Forgets the queue, the kept cache, the answer and the last picks (logout).
   * The caller empties the in-memory cache once nothing kept is written any more.
   */
  wipe(): Promise<void>;
}

export function createOfflineDevice({
  api,
  queryClient,
  store,
  settings,
  network,
}: {
  api: ApiClient;
  queryClient: QueryClient;
  /** Where kept data goes: SQLite on a phone. */
  store: KeyValueStore;
  settings: Settings;
  network: Network;
}): OfflineDevice {
  let keep = settings.get(KEEP) === 'yes';

  const memory = memoryStorage<CreateTransactionInput, Transaction>();
  const persistent: QueueStorage<CreateTransactionInput, Transaction> = keyValueStorage(store);
  const storage: QueueStorage<CreateTransactionInput, Transaction> = {
    read: () => (keep ? persistent.read() : memory.read()),
    write: (entries) => (keep ? persistent.write(entries) : memory.write(entries)),
    clear: async () => {
      await memory.clear();
      if (keep) await persistent.clear();
    },
  };

  const queue = createOfflineQueue({
    storage,
    transport: transactionTransport(api, (workspaceId) =>
      refreshAfterChange(queryClient, workspaceId),
    ),
    isOnline: network.isOnline,
  });

  // Saves run one after another; changes made during one are saved by the next.
  let saving: Promise<void> | undefined;
  let dirty = false;
  function save() {
    if (!keep) return;
    if (saving) {
      dirty = true;
      return;
    }
    dirty = false;
    const cache: SavedCache = { version: CACHE_VERSION, state: dehydrate(queryClient) };
    saving = store
      .set(CACHE_KEY, cache)
      .catch(() => undefined)
      .finally(() => {
        saving = undefined;
        if (dirty) save();
      });
  }
  queryClient.getQueryCache().subscribe(save);

  /** Deletes what SQLite holds, once a save under way has finished. */
  async function forgetKept() {
    await saving;
    await persistent.clear();
    await store.delete(CACHE_KEY);
  }

  function setKeepFlag(next: boolean) {
    keep = next;
    settings.set(KEEP, next ? 'yes' : null);
  }

  async function wipe() {
    setKeepFlag(false);
    settings.set(OWNER, null);
    forgetLastPicks(settings);
    await queue.clear();
    await forgetKept();
  }

  const device: OfflineDevice = {
    queue,
    keeps: () => keep,
    async signedIn(userId, next) {
      if (settings.get(OWNER) !== userId) {
        await wipe();
        queryClient.removeQueries();
      }
      settings.set(OWNER, userId);
      await device.setKeep(next);
    },
    async setKeep(next) {
      setKeepFlag(next);
      if (next) {
        await persistent.write(queue.entries());
        save();
      } else {
        // An earlier "yes" whose logout never came (the session lapsed): forget what it kept.
        await forgetKept();
      }
    },
    async restore() {
      if (!keep) return;
      try {
        const saved = await store.get<SavedCache>(CACHE_KEY);
        if (saved?.version === CACHE_VERSION) hydrate(queryClient, saved.state);
      } catch {
        // Nothing to restore: the app loads from the API.
      }
    },
    start() {
      const replay = () => void queue.replay();
      replay();
      const unsubscribe = network.subscribe(replay);
      // The server may have failed a change (busy, down) while the phone stayed online.
      const retry = setInterval(() => {
        if (queue.entries().length > 0) replay();
      }, RETRY_EVERY);
      return () => {
        unsubscribe();
        clearInterval(retry);
      };
    },
    wipe,
  };
  return device;
}
