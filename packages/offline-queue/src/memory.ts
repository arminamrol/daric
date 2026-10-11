import type { KeyValueStore } from './indexeddb';
import type { Entry, QueueStorage } from './queue';

/** Keeps the entries in memory only: for tests, and devices that keep no data. */
export function memoryStorage<P, S>(): QueueStorage<P, S> {
  let stored: readonly Entry<P, S>[] = [];
  return {
    read: async () => [...stored],
    write: async (entries) => void (stored = [...entries]),
    clear: async () => void (stored = []),
  };
}

/** A key-value store in memory, cloning values as IndexedDB does; for tests. */
export function memoryKeyValueStore(): KeyValueStore {
  const values = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => structuredClone(values.get(key)) as T | undefined,
    set: async (key, value) => void values.set(key, structuredClone(value)),
    delete: async (key) => void values.delete(key),
  };
}
