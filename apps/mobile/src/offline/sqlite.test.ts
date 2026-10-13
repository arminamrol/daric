import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { sqliteKeyValueStore } from './sqlite';
import type { SqlDatabase } from './sqlite';

/** node:sqlite behind the slice of expo-sqlite's async API the store uses. */
function nodeDatabase(db = new DatabaseSync(':memory:')): SqlDatabase {
  return {
    execAsync: async (source) => void db.exec(source),
    runAsync: async (source, ...params) => db.prepare(source).run(...params),
    getFirstAsync: async <T>(source: string, ...params: string[]) =>
      (db.prepare(source).get(...params) as T | undefined) ?? null,
  };
}

describe('sqliteKeyValueStore', () => {
  it('gives back what was set, bigint Amounts included', async () => {
    const store = sqliteKeyValueStore(nodeDatabase());
    const value = { amount: 12_345_678_901_234_567_890n, note: 'نان', nested: [{ n: -1n }] };
    await store.set('entries', value);
    expect(await store.get('entries')).toEqual(value);
  });

  it('replaces a value set again, and forgets a deleted one', async () => {
    const store = sqliteKeyValueStore(nodeDatabase());
    await store.set('k', 1);
    await store.set('k', 2);
    expect(await store.get('k')).toBe(2);
    await store.delete('k');
    expect(await store.get('k')).toBeUndefined();
  });

  it('keeps values in the database, for the next app start', async () => {
    const db = new DatabaseSync(':memory:');
    await sqliteKeyValueStore(nodeDatabase(db)).set('k', { a: 1n });
    expect(await sqliteKeyValueStore(nodeDatabase(db)).get('k')).toEqual({ a: 1n });
  });
});
