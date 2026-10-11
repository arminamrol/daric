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
import { accountsKey } from '../accounts/accounts';
import { transactionsKey } from '../transactions/keys';
import { transactionTransport } from './transport';

export type TransactionQueue = OfflineQueue<CreateTransactionInput, Transaction>;

/** Whether this browser is an Offline Device; asked at login, off unless the user says yes. */
const KEEP_KEY = 'daric.keepData';
/** Device-local picks that name Workspace data, wiped with it. */
const LAST_PICKS_PREFIX = 'daric.lastPicks.';
const CACHE_KEY = 'queryCache';
/** Bumped when the cached shapes change, so an old cache is not restored. */
const CACHE_VERSION = 1;

interface SavedCache {
  version: number;
  state: DehydratedState;
}

function readKeep(): boolean {
  try {
    return localStorage.getItem(KEEP_KEY) === 'yes';
  } catch {
    return false;
  }
}

function writeKeep(keep: boolean) {
  try {
    if (keep) localStorage.setItem(KEEP_KEY, 'yes');
    else localStorage.removeItem(KEEP_KEY);
  } catch {
    // Storage blocked: nothing is kept anyway.
  }
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
  database = 'daric',
}: {
  api: ApiClient;
  queryClient: QueryClient;
  /** The IndexedDB database to keep data in. */
  database?: string;
}): OfflineDevice {
  let keep = readKeep();
  // Opened only once something is kept or wiped: not every browser has IndexedDB.
  let store: KeyValueStore | undefined;
  const db = () => (store ??= keyValueStore(database));

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
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: transactionsKey(workspaceId),
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({ queryKey: accountsKey(workspaceId), refetchType: 'all' }),
      ]),
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

  return {
    queue,
    keeps: () => keep,
    async setKeep(next) {
      keep = next;
      writeKeep(next);
      if (next) {
        await persistent().write(queue.entries());
        save();
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
      return () => window.removeEventListener('online', replay);
    },
    async wipe() {
      keep = false;
      writeKeep(false);
      forgetLastPicks();
      await queue.clear();
      await saving;
      if (typeof indexedDB !== 'undefined') {
        try {
          await persistent().clear();
          await db().delete(CACHE_KEY);
        } catch {
          // IndexedDB unavailable: nothing was kept there.
        }
      }
    },
  };
}
