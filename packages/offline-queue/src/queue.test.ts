import { describe, expect, it } from 'vitest';
import { memoryStorage } from './memory';
import { createOfflineQueue } from './queue';
import type { Change, SendResult, Transport } from './queue';

/** What a test entity is made of; the server adds a version. */
interface Fields {
  name: string;
}
interface Stored extends Fields {
  id: string;
  version: number;
}

const offline = () => new TypeError('Failed to fetch');

/**
 * An in-memory server behind a transport, as the queue sees it: creates are
 * idempotent by id, edits must name the current version, deletes win.
 * Offline, the device knows it and nothing is sent.
 */
function fakeServer() {
  const records = new Map<string, Stored>();
  const deleted = new Set<string>();
  const sent: string[] = [];
  let down = false;
  let lostReplies = 0;
  let gate: Promise<void> | undefined;
  let arrive: (() => void) | undefined;

  const transport: Transport<Fields, Stored> = {
    async send(change): Promise<SendResult<Stored>> {
      arrive?.();
      await gate;
      if (down) throw offline();
      sent.push(`${change.kind}:${change.entityId}`);
      const result = apply(change);
      if (lostReplies > 0) {
        lostReplies--;
        throw offline();
      }
      return result;
    },
  };

  function apply(change: Change<Fields>): SendResult<Stored> {
    const current = records.get(change.entityId);
    switch (change.kind) {
      case 'create':
        if (!current && !deleted.has(change.entityId)) {
          records.set(change.entityId, { id: change.entityId, ...change.payload, version: 1 });
        }
        return { status: 'done' };
      case 'update':
        if (!current) return { status: 'gone' };
        if (change.payload.name === '') return { status: 'rejected', reason: 'name required' };
        if (current.version !== change.baseVersion) {
          return { status: 'conflict', current: { ...current }, version: current.version };
        }
        records.set(change.entityId, {
          ...current,
          ...change.payload,
          version: current.version + 1,
        });
        return { status: 'done', version: current.version + 1 };
      case 'delete':
        records.delete(change.entityId);
        deleted.add(change.entityId);
        return { status: 'done' };
    }
  }

  return {
    transport,
    isOnline: () => !down,
    records,
    sent,
    goOffline: () => void (down = true),
    goOnline: () => void (down = false),
    /** The server applies the next `count` sends but the replies never arrive. */
    loseReplies: (count: number) => void (lostReplies = count),
    /** Holds sends until `release`; `arrived` settles once one is held. */
    hold() {
      let open!: () => void;
      gate = new Promise((resolve) => (open = resolve));
      const arrived = new Promise<void>((resolve) => (arrive = resolve));
      return {
        arrived,
        release() {
          gate = undefined;
          arrive = undefined;
          open();
        },
      };
    },
    /** Someone else edits it meanwhile. */
    editElsewhere(id: string, name: string) {
      const current = records.get(id);
      if (!current) throw new Error(`no ${id}`);
      records.set(id, { ...current, name, version: current.version + 1 });
    },
  };
}

function setup(storage = memoryStorage<Fields, Stored>()) {
  const server = fakeServer();
  const queue = createOfflineQueue({
    storage,
    transport: server.transport,
    isOnline: server.isOnline,
  });
  return { server, queue, storage };
}

const create = (entityId: string, name: string): Change<Fields> => ({
  kind: 'create',
  scope: 'ws',
  entityId,
  payload: { name },
});
const update = (entityId: string, name: string, baseVersion: number): Change<Fields> => ({
  kind: 'update',
  scope: 'ws',
  entityId,
  payload: { name },
  baseVersion,
});
const remove = (entityId: string): Change<Fields> => ({ kind: 'delete', scope: 'ws', entityId });

describe('offline queue', () => {
  it('sends a change at once when online', async () => {
    const { server, queue } = setup();
    expect(await queue.submit(create('a', 'rent'))).toEqual({ status: 'synced' });
    expect(server.records.get('a')).toMatchObject({ name: 'rent', version: 1 });
    expect(queue.entries()).toEqual([]);
  });

  it('keeps changes while offline and replays them in order', async () => {
    const { server, queue } = setup();
    server.goOffline();
    expect(await queue.submit(create('a', 'rent'))).toEqual({ status: 'queued' });
    expect(await queue.submit(create('b', 'food'))).toEqual({ status: 'queued' });
    expect(await queue.submit(create('c', 'fuel'))).toEqual({ status: 'queued' });
    expect(queue.entries().map((e) => e.entityId)).toEqual(['a', 'b', 'c']);

    server.goOnline();
    await queue.replay();
    expect(server.sent).toEqual(['create:a', 'create:b', 'create:c']);
    expect(queue.entries()).toEqual([]);
  });

  it('stops at the first change the network fails and keeps the rest in order', async () => {
    const { server, queue } = setup();
    server.goOffline();
    await queue.submit(create('a', 'rent'));
    await queue.submit(create('b', 'food'));
    await queue.replay();
    expect(server.sent).toEqual([]);
    expect(queue.entries().map((e) => e.entityId)).toEqual(['a', 'b']);
  });

  it('records a create once when its reply was lost and it is sent again', async () => {
    const { server, queue } = setup();
    server.loseReplies(1);
    expect(await queue.submit(create('a', 'rent'))).toEqual({ status: 'queued' });
    await queue.replay();
    expect(server.sent).toEqual(['create:a', 'create:a']);
    expect([...server.records.keys()]).toEqual(['a']);
    expect(queue.entries()).toEqual([]);
  });

  it('sends each change once when replays overlap', async () => {
    const { server, queue } = setup();
    server.goOffline();
    await queue.submit(create('a', 'rent'));
    server.goOnline();
    await Promise.all([queue.replay(), queue.replay(), queue.replay()]);
    expect(server.sent).toEqual(['create:a']);
  });

  it('replays what an earlier session left in storage', async () => {
    const storage = memoryStorage<Fields, Stored>();
    const first = setup(storage);
    first.server.goOffline();
    await first.queue.submit(create('a', 'rent'));

    const later = createOfflineQueue({
      storage,
      transport: first.server.transport,
      isOnline: first.server.isOnline,
    });
    first.server.goOnline();
    await later.replay();
    expect(first.server.records.get('a')).toMatchObject({ name: 'rent' });
    expect(later.entries()).toEqual([]);
  });

  it('folds an edit into a create not sent yet', async () => {
    const { server, queue } = setup();
    server.goOffline();
    await queue.submit(create('a', 'rent'));
    await queue.submit(update('a', 'rent (May)', 1));
    expect(queue.entries()).toMatchObject([{ kind: 'create', payload: { name: 'rent (May)' } }]);
    server.goOnline();
    await queue.replay();
    expect(server.sent).toEqual(['create:a']);
    expect(server.records.get('a')).toMatchObject({ name: 'rent (May)', version: 1 });
  });

  it('sends an edit separately once its create may have reached the server', async () => {
    const { server, queue } = setup();
    server.loseReplies(1);
    await queue.submit(create('a', 'rent'));
    server.goOffline();
    await queue.submit(update('a', 'rent (May)', 1));
    expect(queue.entries().map((e) => e.kind)).toEqual(['create', 'update']);
    server.goOnline();
    await queue.replay();
    expect(server.records.get('a')).toMatchObject({ name: 'rent (May)', version: 2 });
  });

  it('keeps the first base version when edits pile up offline', async () => {
    const { server, queue } = setup();
    await queue.submit(create('a', 'rent'));
    server.goOffline();
    await queue.submit(update('a', 'one', 1));
    await queue.submit(update('a', 'two', 2));
    expect(queue.entries()).toMatchObject([
      { kind: 'update', baseVersion: 1, payload: { name: 'two' } },
    ]);
    server.goOnline();
    await queue.replay();
    expect(server.records.get('a')).toMatchObject({ name: 'two', version: 2 });
  });

  it('drops a create and its delete when neither was sent', async () => {
    const { server, queue } = setup();
    server.goOffline();
    await queue.submit(create('a', 'rent'));
    expect(await queue.submit(remove('a'))).toEqual({ status: 'synced' });
    expect(queue.entries()).toEqual([]);
    server.goOnline();
    await queue.replay();
    expect(server.sent).toEqual([]);
  });

  it('lets a delete replace the edits waiting before it', async () => {
    const { server, queue } = setup();
    await queue.submit(create('a', 'rent'));
    server.goOffline();
    await queue.submit(update('a', 'one', 1));
    await queue.submit(remove('a'));
    expect(queue.entries().map((e) => e.kind)).toEqual(['delete']);
    server.goOnline();
    await queue.replay();
    expect(server.sent).toEqual(['create:a', 'delete:a']);
    expect(server.records.has('a')).toBe(false);
  });

  describe('conflicts', () => {
    it('holds a stale edit with the server copy until the user picks', async () => {
      const { server, queue } = setup();
      await queue.submit(create('a', 'rent'));
      server.editElsewhere('a', 'theirs');
      const outcome = await queue.submit(update('a', 'mine', 1));
      expect(outcome).toEqual({
        status: 'conflict',
        current: { id: 'a', name: 'theirs', version: 2 },
      });
      expect(queue.entries()).toMatchObject([
        {
          kind: 'update',
          status: 'conflict',
          current: { name: 'theirs' },
          payload: { name: 'mine' },
        },
      ]);
      // Waiting for the user does not hold back other Transactions.
      expect(await queue.submit(create('b', 'food'))).toEqual({ status: 'synced' });
      await queue.replay();
      expect(server.records.get('a')).toMatchObject({ name: 'theirs' });
    });

    it('keep mine resends the edit against the server copy', async () => {
      const { server, queue } = setup();
      await queue.submit(create('a', 'rent'));
      server.editElsewhere('a', 'theirs');
      await queue.submit(update('a', 'mine', 1));
      expect(await queue.resolve('ws', 'a', 'mine')).toEqual({ status: 'synced' });
      expect(server.records.get('a')).toMatchObject({ name: 'mine', version: 3 });
      expect(queue.entries()).toEqual([]);
    });

    it('keep theirs drops the edit', async () => {
      const { server, queue } = setup();
      await queue.submit(create('a', 'rent'));
      server.editElsewhere('a', 'theirs');
      await queue.submit(update('a', 'mine', 1));
      expect(await queue.resolve('ws', 'a', 'theirs')).toEqual({ status: 'synced' });
      expect(server.records.get('a')).toMatchObject({ name: 'theirs', version: 2 });
      expect(queue.entries()).toEqual([]);
    });

    it('another edit keeps waiting on the conflict unless it starts from the server copy', async () => {
      const { server, queue } = setup();
      await queue.submit(create('a', 'rent'));
      server.editElsewhere('a', 'theirs');
      await queue.submit(update('a', 'mine', 1));
      expect(await queue.submit(update('a', 'mine again', 1))).toMatchObject({
        status: 'conflict',
      });
      expect(await queue.submit(update('a', 'mine at last', 2))).toEqual({ status: 'synced' });
      expect(server.records.get('a')).toMatchObject({ name: 'mine at last', version: 3 });
    });

    it('a conflict found during replay waits in the queue', async () => {
      const { server, queue } = setup();
      await queue.submit(create('a', 'rent'));
      server.goOffline();
      await queue.submit(update('a', 'mine', 1));
      server.editElsewhere('a', 'theirs');
      server.goOnline();
      await queue.replay();
      expect(queue.entries()).toMatchObject([{ status: 'conflict', current: { version: 2 } }]);
    });

    it('a delete wins over an edit waiting on a conflict', async () => {
      const { server, queue } = setup();
      await queue.submit(create('a', 'rent'));
      server.editElsewhere('a', 'theirs');
      await queue.submit(update('a', 'mine', 1));
      await queue.submit(remove('a'));
      expect(queue.entries()).toEqual([]);
      expect(server.records.has('a')).toBe(false);
    });

    it('a delete queued while a stale edit is on its way wins', async () => {
      const { server, queue } = setup();
      await queue.submit(create('a', 'rent'));
      server.editElsewhere('a', 'theirs');
      const { arrived, release } = server.hold();
      const edit = queue.submit(update('a', 'mine', 1));
      await arrived;
      const del = queue.submit(remove('a'));
      release();
      await Promise.all([edit, del]);
      expect(queue.entries()).toEqual([]);
      expect(server.records.has('a')).toBe(false);
    });
  });

  it('an edit made while the one before it is on its way builds on it, not against it', async () => {
    const { server, queue } = setup();
    await queue.submit(create('a', 'rent'));
    const { arrived, release } = server.hold();
    const first = queue.submit(update('a', 'one', 1));
    await arrived;
    const second = queue.submit(update('a', 'two', 1));
    release();
    expect(await first).toEqual({ status: 'synced' });
    expect(await second).toEqual({ status: 'synced' });
    expect(server.records.get('a')).toMatchObject({ name: 'two', version: 3 });
  });

  it("lists an entity's waiting changes, with whether they may have reached the server", async () => {
    const { server, queue } = setup();
    server.loseReplies(1);
    await queue.submit(create('a', 'rent'));
    server.goOffline();
    await queue.submit(update('a', 'one', 1));
    await queue.submit({ ...create('a', 'elsewhere'), scope: 'other' });
    expect(queue.entriesFor('ws', 'a').map((e) => [e.kind, e.attempted])).toEqual([
      ['create', true],
      ['update', false],
    ]);
  });

  it('drops an edit of something deleted on the server: deletes win', async () => {
    const { server, queue } = setup();
    expect(await queue.submit(update('gone', 'mine', 1))).toEqual({ status: 'gone' });
    expect(queue.entries()).toEqual([]);
    expect(server.records.has('gone')).toBe(false);
  });

  it('holds a change the server refuses until it is discarded', async () => {
    const { queue } = setup();
    await queue.submit(create('a', 'rent'));
    expect(await queue.submit(update('a', '', 1))).toEqual({
      status: 'rejected',
      reason: 'name required',
    });
    expect(queue.entries()).toMatchObject([{ status: 'rejected', reason: 'name required' }]);
    expect(await queue.discard('ws', 'a')).toBe(true);
    expect(queue.entries()).toEqual([]);
  });

  it('cancels a change not sent yet, but not one already on its way', async () => {
    const { server, queue } = setup();
    await queue.submit(create('a', 'rent'));
    server.goOffline();
    await queue.submit(remove('a'));
    expect(await queue.discard('ws', 'a')).toBe(true);
    expect(queue.entries()).toEqual([]);

    server.goOnline();
    const { arrived, release } = server.hold();
    const sending = queue.submit(remove('a'));
    await arrived;
    expect(await queue.discard('ws', 'a')).toBe(false);
    release();
    await sending;
    expect(server.records.has('a')).toBe(false);
  });

  it('tells subscribers about every change to the entries', async () => {
    const { server, queue } = setup();
    const seen: number[] = [];
    const unsubscribe = queue.subscribe(() => seen.push(queue.entries().length));
    server.goOffline();
    await queue.submit(create('a', 'rent'));
    server.goOnline();
    await queue.replay();
    unsubscribe();
    await queue.submit(create('b', 'food'));
    expect(seen.at(0)).toBe(1);
    expect(seen.at(-1)).toBe(0);
  });

  it('clear wipes the queue and its storage', async () => {
    const { server, queue, storage } = setup();
    server.goOffline();
    await queue.submit(create('a', 'rent'));
    await queue.clear();
    expect(queue.entries()).toEqual([]);
    expect(await storage.read()).toEqual([]);
    server.goOnline();
    await queue.replay();
    expect(server.sent).toEqual([]);
  });

  it('keeps changes of different scopes apart', async () => {
    const { server, queue } = setup();
    server.goOffline();
    await queue.submit({ ...create('a', 'rent'), scope: 'one' });
    await queue.submit({ ...remove('a'), scope: 'two' });
    expect(queue.entries().map((e) => `${e.scope}:${e.kind}`)).toEqual([
      'one:create',
      'two:delete',
    ]);
  });
});
