/**
 * A change to one entity, made on the device. `scope` is where the entity
 * lives (a Workspace id); an entity is known by its scope and id together.
 */
export type Change<P> =
  | { kind: 'create'; scope: string; entityId: string; payload: P }
  /** `baseVersion` is the server version the edit started from. */
  | { kind: 'update'; scope: string; entityId: string; payload: P; baseVersion: number }
  | { kind: 'delete'; scope: string; entityId: string };

/** Where a waiting change stands. */
export type EntryState<S> =
  | { status: 'pending' }
  /** The server holds a newer version; the user picks theirs or mine. */
  | { status: 'conflict'; current: S; version: number }
  /** The server refused it for good; it waits to be discarded. */
  | { status: 'rejected'; reason: string };

/** A change waiting in the queue, in the order it was made. */
export type Entry<P, S> = Change<P> &
  EntryState<S> & {
    /** Increases with every new entry; the queue replays in this order. */
    seq: number;
    /** It was sent at least once, so it may have reached the server. */
    attempted: boolean;
  };

/** How the server answered one change. Throwing instead means try again later. */
export type SendResult<S> =
  /** `version` is the entity's server version after the change, when known. */
  | { status: 'done'; version?: number }
  /** The edit started from a stale version; `current` is the server's copy. */
  | { status: 'conflict'; current: S; version: number }
  /** The entity was deleted on the server; deletes win, so the change is dropped. */
  | { status: 'gone' }
  | { status: 'rejected'; reason: string };

export interface Transport<P, S> {
  /** Sends one change. Throws when it could not tell, e.g. the network is down. */
  send(change: Change<P>): Promise<SendResult<S>>;
}

/** Where the entries are kept between sessions. Each write replaces them all. */
export interface QueueStorage<P, S> {
  read(): Promise<Entry<P, S>[]>;
  write(entries: readonly Entry<P, S>[]): Promise<void>;
  clear(): Promise<void>;
}

/** What became of a submitted change by the time `submit` returned. */
export type Outcome<S> =
  | { status: 'synced' }
  /** Still waiting: offline, or the network failed. It is replayed later. */
  | { status: 'queued' }
  | { status: 'conflict'; current: S }
  | { status: 'gone' }
  | { status: 'rejected'; reason: string };

export interface OfflineQueue<P, S> {
  /** Queues a change, then replays; says what became of it. */
  submit(change: Change<P>): Promise<Outcome<S>>;
  /**
   * Sends the waiting changes in order until the network fails. Changes held
   * on a conflict or refusal are skipped, with later changes to the same entity.
   * Overlapping calls share one run.
   */
  replay(): Promise<void>;
  /** Settles a conflict: `mine` resends the edit against the server copy, `theirs` drops it. */
  resolve(scope: string, entityId: string, pick: 'mine' | 'theirs'): Promise<Outcome<S>>;
  /** Drops an entity's waiting changes, except one already on its way. True when any was dropped. */
  discard(scope: string, entityId: string): Promise<boolean>;
  /** The waiting changes, oldest first. The same array until they change. */
  entries(): readonly Entry<P, S>[];
  /** One entity's waiting changes, oldest first, the one on its way included. */
  entriesFor(scope: string, entityId: string): readonly Entry<P, S>[];
  subscribe(listener: () => void): () => void;
  /** Forgets every waiting change, here and in storage (logout). */
  clear(): Promise<void>;
}

export interface OfflineQueueOptions<P, S> {
  storage: QueueStorage<P, S>;
  transport: Transport<P, S>;
  /** Whether the device believes it is online; nothing is sent while it is not. */
  isOnline?: () => boolean;
  /**
   * The payload of an edit folded into an earlier change of the same entity:
   * by default the later one replaces it, as when every payload is whole.
   * Payloads naming only the fields they change merge them instead.
   */
  merge?: (earlier: P, later: P) => P;
}

/**
 * The offline write queue (ADR-0005). Changes are kept in storage and sent in
 * the order they were made. Before sending, later changes fold into earlier
 * ones: an edit into a create not yet sent, edits into one edit that keeps the
 * first base version, and a delete replaces everything before it (or cancels a
 * create that never left the device). Creates carry their own id, so sending
 * one twice is harmless.
 */
export function createOfflineQueue<P, S>({
  storage,
  transport,
  isOnline = () => true,
  merge = (_, later) => later,
}: OfflineQueueOptions<P, S>): OfflineQueue<P, S> {
  let list: readonly Entry<P, S>[] = [];
  let nextSeq = 1;
  /** The entry on its way to the server, which folding leaves alone. */
  let sending: number | undefined;
  /** How entries that left the queue during a replay ended, for `submit`. */
  const settled = new Map<number, Outcome<S>>();
  const listeners = new Set<() => void>();
  let running: Promise<void> | undefined;

  // State changes run one at a time, after the stored entries are loaded.
  let lock: Promise<unknown> = storage.read().then((stored) => {
    list = [...stored].sort((a, b) => a.seq - b.seq);
    nextSeq = Math.max(0, ...list.map((e) => e.seq)) + 1;
    if (list.length > 0) notify();
  });

  function exclusive<T>(step: () => T | Promise<T>): Promise<T> {
    const result = lock.then(step);
    lock = result.catch(() => undefined);
    return result;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  async function commit(next: readonly Entry<P, S>[]) {
    list = next;
    notify();
    await storage.write(next);
  }

  const same = (e: Entry<P, S>, scope: string, entityId: string) =>
    e.scope === scope && e.entityId === entityId;

  /** Queues `change`, folding it into what waits; the seq that carries it, if any. */
  function enqueue(change: Change<P>): Promise<number | undefined> {
    return exclusive(async () => {
      const { scope, entityId } = change;
      const waiting = list.filter((e) => same(e, scope, entityId) && e.seq !== sending);
      const fresh = (): Entry<P, S> => ({
        ...change,
        status: 'pending',
        seq: nextSeq++,
        attempted: false,
      });

      if (change.kind === 'delete') {
        const rest = list.filter((e) => !waiting.includes(e));
        // A create that never left the device: nothing reaches the server at all.
        if (waiting.some((e) => e.kind === 'create' && !e.attempted)) {
          await commit(rest);
          return undefined;
        }
        const entry = fresh();
        await commit([...rest, entry]);
        return entry.seq;
      }

      if (change.kind === 'update') {
        // Folding sends the edit where the earlier change waits; it may refer to
        // something made after that (a Label it now carries), so it folds only
        // when nothing of another entity waits behind.
        const last = (entry: Entry<P, S>) =>
          list.every((e) => e.seq <= entry.seq || same(e, scope, entityId));
        const create = waiting.find((e) => e.kind === 'create' && !e.attempted && last(e));
        if (create?.kind === 'create') {
          const payload = merge(create.payload, change.payload);
          await commit(list.map((e) => (e === create ? { ...e, payload } : e)));
          return create.seq;
        }
        // An edit held on a conflict is always settled in place: nothing passes it.
        const edit = waiting.find(
          (e) => e.kind === 'update' && (e.status === 'conflict' || last(e)),
        );
        if (edit?.kind === 'update') {
          // One made against the server copy settles the conflict, replacing the
          // edit held on it; an older one waits on it.
          const conflict = edit.status === 'conflict';
          const settles = !conflict || change.baseVersion >= edit.version;
          const merged: Entry<P, S> = settles
            ? {
                ...change,
                payload: conflict ? change.payload : merge(edit.payload, change.payload),
                baseVersion: conflict ? change.baseVersion : edit.baseVersion,
                status: 'pending',
                seq: edit.seq,
                attempted: edit.attempted,
              }
            : { ...edit, payload: merge(edit.payload, change.payload) };
          await commit(list.map((e) => (e === edit ? merged : e)));
          return edit.seq;
        }
      }

      const entry = fresh();
      await commit([...list, entry]);
      return entry.seq;
    });
  }

  /** The next entry to send: pending, and nothing before it holds its entity back. */
  function next(): Entry<P, S> | undefined {
    const held = new Set<string>();
    for (const entry of list) {
      const key = `${entry.scope}\u0000${entry.entityId}`;
      if (entry.status === 'pending' && !held.has(key)) return entry;
      held.add(key);
    }
    return undefined;
  }

  async function run() {
    while (isOnline()) {
      const entry = await exclusive(async () => {
        const found = next();
        if (!found) return undefined;
        sending = found.seq;
        if (!found.attempted) {
          await commit(list.map((e) => (e === found ? { ...e, attempted: true } : e)));
        }
        return found;
      });
      if (!entry) return;

      let result: SendResult<S>;
      try {
        result = await transport.send(changeOf(entry));
      } catch {
        await exclusive(() => (sending = undefined));
        return;
      }

      await exclusive(async () => {
        sending = undefined;
        if (!list.some((e) => e.seq === entry.seq)) return; // cleared meanwhile
        const { scope, entityId } = entry;
        const deleteWaits = list.some(
          (e) => same(e, scope, entityId) && e.kind === 'delete' && e.seq > entry.seq,
        );
        const without = list.filter((e) => e.seq !== entry.seq);
        // Deletes win: a delete waiting behind this change makes its conflict moot.
        if (result.status === 'done' || result.status === 'gone' || deleteWaits) {
          settled.set(entry.seq, { status: result.status === 'gone' ? 'gone' : 'synced' });
          // An edit queued while this one was on its way started from the same
          // version; it builds on this one, so it moves up to the new version.
          const version = result.status === 'done' ? result.version : undefined;
          const from = entry.kind === 'update' ? entry.baseVersion : undefined;
          await commit(
            version === undefined || from === undefined
              ? without
              : without.map((e) =>
                  same(e, scope, entityId) && e.kind === 'update' && e.baseVersion === from
                    ? { ...e, baseVersion: version }
                    : e,
                ),
          );
        } else {
          const state: EntryState<S> =
            result.status === 'conflict'
              ? { status: 'conflict', current: result.current, version: result.version }
              : { status: 'rejected', reason: result.reason };
          await commit(list.map((e) => (e.seq === entry.seq ? { ...e, ...state } : e)));
        }
      });
    }
  }

  function replay(): Promise<void> {
    running ??= run().finally(() => (running = undefined));
    return running;
  }

  /** What became of the entry `seq` after a replay. */
  function outcomeOf(seq: number | undefined): Outcome<S> {
    if (seq === undefined) return { status: 'synced' };
    const entry = list.find((e) => e.seq === seq);
    if (!entry) {
      const outcome = settled.get(seq) ?? { status: 'synced' };
      settled.delete(seq);
      return outcome;
    }
    if (entry.status === 'conflict') return { status: 'conflict', current: entry.current };
    if (entry.status === 'rejected') return { status: 'rejected', reason: entry.reason };
    return { status: 'queued' };
  }

  async function afterReplay(seq: number | undefined): Promise<Outcome<S>> {
    await replay();
    // A replay already under way may have stopped before reaching it.
    if (list.some((e) => e.seq === seq && e.status === 'pending' && !e.attempted)) {
      await replay();
    }
    return outcomeOf(seq);
  }

  return {
    async submit(change) {
      return afterReplay(await enqueue(change));
    },
    replay,
    async resolve(scope, entityId, pick) {
      const seq = await exclusive(async () => {
        const entry = list.find((e) => same(e, scope, entityId) && e.status === 'conflict');
        if (entry?.status !== 'conflict' || entry.kind !== 'update') return undefined;
        if (pick === 'theirs') {
          await commit(list.filter((e) => e !== entry));
          return undefined;
        }
        const resent: Entry<P, S> = {
          kind: 'update',
          scope,
          entityId,
          payload: entry.payload,
          baseVersion: entry.version,
          status: 'pending',
          seq: entry.seq,
          attempted: entry.attempted,
        };
        await commit(list.map((e) => (e === entry ? resent : e)));
        return entry.seq;
      });
      return afterReplay(seq);
    },
    discard(scope, entityId) {
      return exclusive(async () => {
        const rest = list.filter((e) => !same(e, scope, entityId) || e.seq === sending);
        if (rest.length === list.length) return false;
        await commit(rest);
        return true;
      });
    },
    entries: () => list,
    entriesFor: (scope, entityId) => list.filter((e) => same(e, scope, entityId)),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    clear() {
      return exclusive(async () => {
        settled.clear();
        list = [];
        notify();
        await storage.clear();
      });
    },
  };
}

/** The change an entry carries, without its bookkeeping. */
function changeOf<P, S>(entry: Entry<P, S>): Change<P> {
  const { scope, entityId } = entry;
  switch (entry.kind) {
    case 'create':
      return { kind: 'create', scope, entityId, payload: entry.payload };
    case 'update':
      return {
        kind: 'update',
        scope,
        entityId,
        payload: entry.payload,
        baseVersion: entry.baseVersion,
      };
    case 'delete':
      return { kind: 'delete', scope, entityId };
  }
}
