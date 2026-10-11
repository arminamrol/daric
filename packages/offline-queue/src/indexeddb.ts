import type { Entry, QueueStorage } from './queue';

/**
 * One IndexedDB object store used as a key-value store. Values are stored by
 * structured clone, so bigint Amounts survive as they are.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

const STORE = 'kv';

/** Opens (creating if needed) the database `name` with one key-value store. */
export function keyValueStore(name: string, factory: IDBFactory = indexedDB): KeyValueStore {
  let db: Promise<IDBDatabase> | undefined;
  const open = () =>
    (db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        db = undefined;
        reject(request.error ?? new Error(`Could not open ${name}`));
      };
    }));

  async function run<T>(mode: IDBTransactionMode, step: (store: IDBObjectStore) => IDBRequest) {
    const database = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const request = step(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = () => reject(tx.error ?? new Error(`Could not use ${name}`));
      tx.onabort = () => reject(tx.error ?? new Error(`Could not use ${name}`));
    });
  }

  return {
    get: (key) => run('readonly', (store) => store.get(key)),
    set: (key, value) => run('readwrite', (store) => store.put(value, key)),
    delete: (key) => run('readwrite', (store) => store.delete(key)),
  };
}

const ENTRIES = 'entries';

/** Keeps the queue in IndexedDB, for the web app on an Offline Device. */
export function indexedDbStorage<P, S>(store: KeyValueStore): QueueStorage<P, S> {
  return {
    read: async () => (await store.get<Entry<P, S>[]>(ENTRIES)) ?? [],
    write: (entries) => store.set(ENTRIES, entries),
    clear: () => store.delete(ENTRIES),
  };
}
