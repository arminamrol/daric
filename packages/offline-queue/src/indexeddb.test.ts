import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { keyValueStore } from './indexeddb';
import { keyValueStorage } from './keyvalue';
import type { Entry } from './queue';

const entry: Entry<{ amount: bigint }, never> = {
  kind: 'create',
  scope: 'ws',
  entityId: 'a',
  payload: { amount: 12_500n },
  status: 'pending',
  seq: 1,
  attempted: false,
};

describe('IndexedDB storage', () => {
  it('keeps the entries, bigints included, across openings', async () => {
    const factory = new IDBFactory();
    await keyValueStorage(keyValueStore('daric-test', factory)).write([entry]);
    const reopened = keyValueStorage(keyValueStore('daric-test', factory));
    expect(await reopened.read()).toEqual([entry]);
  });

  it('reads nothing before the first write and after clearing', async () => {
    const storage = keyValueStorage(keyValueStore('daric-test', new IDBFactory()));
    expect(await storage.read()).toEqual([]);
    await storage.write([entry]);
    await storage.clear();
    expect(await storage.read()).toEqual([]);
  });
});
