import type { KeyValueStore } from './keyvalue';

const STORE = 'kv';

/**
 * Opens (creating if needed) the IndexedDB database `name` with one object
 * store used as a key-value store. Values are stored by structured clone, so
 * bigint Amounts survive as they are.
 */
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
