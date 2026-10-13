import type { Entry, QueueStorage } from './queue';

/**
 * A key-value store the queue and a cache can be kept in: one IndexedDB
 * object store on the web, a SQLite table on a phone. Values come back as
 * they were stored, bigint Amounts included.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

const ENTRIES = 'entries';

/** Keeps the queue in a key-value store, for a device that keeps data offline. */
export function keyValueStorage<P, S>(store: KeyValueStore): QueueStorage<P, S> {
  return {
    read: async () => (await store.get<Entry<P, S>[]>(ENTRIES)) ?? [],
    write: (entries) => store.set(ENTRIES, entries),
    clear: () => store.delete(ENTRIES),
  };
}
