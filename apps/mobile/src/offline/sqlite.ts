import type { KeyValueStore } from '@daric/offline-queue';
import { decode, encode } from './codec';

/** The slice of expo-sqlite's async database the store uses. */
export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: string[]): Promise<unknown>;
  getFirstAsync<T>(source: string, ...params: string[]): Promise<T | null>;
}

/**
 * A key-value store in one SQLite table, for the queue and the kept cache on
 * an Offline Device. Values are stored as JSON with bigints written out.
 */
export function sqliteKeyValueStore(db: SqlDatabase): KeyValueStore {
  const ready = db.execAsync(
    'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  );
  return {
    async get<T>(key: string) {
      await ready;
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM kv WHERE key = ?',
        key,
      );
      return row ? (decode(row.value) as T) : undefined;
    },
    async set(key, value) {
      await ready;
      await db.runAsync(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        key,
        encode(value),
      );
    },
    async delete(key) {
      await ready;
      await db.runAsync('DELETE FROM kv WHERE key = ?', key);
    },
  };
}
