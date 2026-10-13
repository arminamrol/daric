import { transactionTransport } from '@daric/api-client';
import type { ApiClient } from '@daric/api-client';
import type { CreateTransactionInput, Transaction } from '@daric/core';
import {
  createOfflineQueue,
  indexedDbStorage,
  keyValueStore,
  memoryStorage,
} from '@daric/offline-queue';
import type { KeyValueStore, OfflineQueue, QueueStorage } from '@daric/offline-queue';
import { dehydrate, hydrate } from '@tanstack/react-query';
import type { DehydratedState, QueryClient } from '@tanstack/react-query';
import { storedFlag } from '../lib/storedFlag';
import { refreshAfterChange } from '../transactions/keys';

export type TransactionQueue = OfflineQueue<CreateTransactionInput, Transaction>;

/** Whether this browser is an Offline Device; asked at login, off unless the user says yes. */
const keepFlag = storedFlag('daric.keepData');
/** Device-local picks that name Workspace data, wiped with it. */
const LAST_PICKS_PREFIX = 'daric.lastPicks.';
const CACHE_KEY = 'queryCache';
/** Bumped when the cached shapes change, so an old cache is not restored. */
const CACHE_VERSION = 1;
/** How often waiting changes are retried while online, after the server failed them. */
const RETRY_EVERY = 30_000;

interface SavedCache {
  version: number;
  state: DehydratedState;
}

function forgetLastPicks() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(LAST_PICKS_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was remembered.
  }
}

/**
 * Offline support for this browser (ADR-0005). The write queue always runs,
 * so changes made while the connection drops are sent later; but the queue
 * and the TanStack Query cache are written to IndexedDB only on an Offline
 * Device, and everything is wiped on logout.
 */
export interface OfflineDevice {
  queue: TransactionQueue;
  /** Whether Workspace data is kept on this device. */
  keeps(): boolean;
  /** Records the login answer to "Keep data on this device?". */
  setKeep(keep: boolean): Promise<void>;
  /** Restores the cache an earlier visit kept, if any. */
  restore(): Promise<void>;
  /** Starts sending what waits, now and whenever the browser comes back online. */
  start(): () => void;
  /**
   * Forgets the queue, the kept cache and the answer (logout). The caller
   * empties the in-memory cache once nothing kept is written any more.
   */
  wipe(): Promise<void>;
}

export function createOfflineDevice({
  api,
  queryClient,
}: {
  api: ApiClient;
  queryClient: QueryClient;
}): OfflineDevice {
  let keep = keepFlag.get();
  // Opened only once something is kept or wiped: not every browser has IndexedDB.
  let store: KeyValueStore | undefined;
  const db = () => (store ??= keyValueStore('daric'));

  const memory = memoryStorage<CreateTransactionInput, Transaction>();
  const persistent = (): QueueStorage<CreateTransactionInput, Transaction> =>
    indexedDbStorage(db());
  const storage: QueueStorage<CreateTransactionInput, Transaction> = {
    read: () => (keep ? persistent().read() : memory.read()),
    write: (entries) => (keep ? persistent().write(entries) : memory.write(entries)),
    clear: async () => {
      await memory.clear();
      if (keep) await persistent().clear();
    },
  };

  const queue = createOfflineQueue({
    storage,
    transport: transactionTransport(api, (workspaceId) =>
      refreshAfterChange(queryClient, workspaceId),
    ),
    isOnline: () => navigator.onLine,
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
    saving = db()
      .set(CACHE_KEY, cache)
      .catch(() => undefined)
      .finally(() => {
        saving = undefined;
        if (dirty) save();
      });
  }
  queryClient.getQueryCache().subscribe(save);

  /** Deletes what IndexedDB holds, once a save under way has finished. */
  async function forgetKept() {
    await saving;
    if (typeof indexedDB === 'undefined') return;
    try {
      await persistent().clear();
      await db().delete(CACHE_KEY);
    } catch {
      // IndexedDB unavailable: nothing was kept there.
    }
  }

  return {
    queue,
    keeps: () => keep,
    async setKeep(next) {
      keep = next;
      keepFlag.set(next);
      if (next) {
        await persistent().write(queue.entries());
        save();
      } else {
        // An earlier "yes" whose logout never came (the session lapsed): forget what it kept.
        await forgetKept();
      }
    },
    async restore() {
      if (!keep) return;
      try {
        const saved = await db().get<SavedCache>(CACHE_KEY);
        if (saved?.version === CACHE_VERSION) hydrate(queryClient, saved.state);
      } catch {
        // Nothing to restore: the app loads from the API.
      }
    },
    start() {
      const replay = () => void queue.replay();
      replay();
      window.addEventListener('online', replay);
      // The server may have failed a change (busy, down) while the browser stayed online.
      const retry = setInterval(() => {
        if (queue.entries().length > 0) replay();
      }, RETRY_EVERY);
      return () => {
        window.removeEventListener('online', replay);
        clearInterval(retry);
      };
    },
    async wipe() {
      keep = false;
      keepFlag.set(false);
      forgetLastPicks();
      await queue.clear();
      await forgetKept();
    },
  };
}
