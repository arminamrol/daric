import { ApiError, inputFromTransaction, withWaitingChanges } from '@daric/api-client';
import type { SyncState } from '@daric/api-client';
import type {
  CreateTransactionInput,
  ListTransactionsQuery,
  Transaction,
  TransactionType,
} from '@daric/core';
import type { Outcome } from '@daric/offline-queue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { useCategories } from '../categories/categories';
import { useOfflineDevice, useWaitingChanges } from '../offline/offline';
import { refreshAfterChange, transactionsKey } from './keys';

/** The edit started from a stale version; `current` is the server's copy. */
export class EditConflict extends Error {
  constructor(readonly current: Transaction) {
    super('The Transaction changed elsewhere');
    this.name = 'EditConflict';
  }
}

/** The Transaction was deleted elsewhere; deletes win. */
export class TransactionGone extends Error {
  constructor() {
    super('The Transaction was deleted');
    this.name = 'TransactionGone';
  }
}

/** The API refused the change for good. */
export class ChangeRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ChangeRefused';
  }
}

/** Whether a change reached the API or waits on this device to be sent. */
export type Saved = 'synced' | 'queued';

/**
 * Queues a Transaction change and says whether it was sent. One the API
 * refuses is dropped from the queue, and the caller shows the error instead.
 */
function useSubmit() {
  const { queue } = useOfflineDevice();
  const { workspace } = useSignedIn();
  return async (change: Parameters<typeof queue.submit>[0]): Promise<Saved> => {
    const outcome: Outcome<Transaction> = await queue.submit(change);
    switch (outcome.status) {
      case 'synced':
      case 'queued':
        return outcome.status;
      case 'conflict':
        throw new EditConflict(outcome.current);
      case 'gone':
        throw new TransactionGone();
      case 'rejected':
        await queue.discard(workspace.id, change.entityId);
        throw new ChangeRefused(outcome.reason);
    }
  };
}

const NO_STATES: ReadonlyMap<string, SyncState> = new Map();

/** Loading, failed with nothing to show, or something to show (maybe from before a failed refetch). */
export type Loaded<T> =
  | { isPending: true; isError: false; data: undefined }
  | { isPending: false; isError: true; data: undefined }
  | { isPending: false; isError: false; data: T };

function loaded<T>(data: T | undefined, isPending: boolean): Loaded<T> {
  if (data !== undefined) return { isPending: false, isError: false, data };
  return isPending
    ? { isPending: true, isError: false, data: undefined }
    : { isPending: false, isError: true, data: undefined };
}

/**
 * The Workspace's Transactions matching `filters`, newest first, with the
 * changes still waiting to be sent shown on top and their states.
 */
export function useTransactions(
  filters: ListTransactionsQuery,
): Loaded<Transaction[]> & { states: ReadonlyMap<string, SyncState> } {
  const api = useApi();
  const { me, workspace } = useSignedIn();
  const query = useQuery({
    queryKey: [...transactionsKey(workspace.id), filters],
    queryFn: () => api.listTransactions(workspace.id, filters),
  });
  const categories = useCategories();
  const waiting = useWaitingChanges(workspace.id);
  const shown = useMemo(
    () =>
      query.data &&
      withWaitingChanges(query.data, waiting, {
        filters,
        calendar: workspace.calendar,
        categories: categories.data ?? [],
        userId: me.user.id,
      }),
    [query.data, waiting, filters, workspace.calendar, categories.data, me.user.id],
  );
  // A list from an earlier fetch (or visit) is still shown when a refetch fails.
  return { ...loaded(shown?.transactions, query.isPending), states: shown?.states ?? NO_STATES };
}

/** Member or above. Shown at once; sent now, or once the device is back online. */
export function useRecordTransaction() {
  const { workspace } = useSignedIn();
  const submit = useSubmit();
  return useMutation({
    // The queue decides when it can send; the mutation must not wait for the network.
    networkMode: 'always',
    mutationFn: (input: CreateTransactionInput) => {
      const id = input.id ?? uuidv7();
      return submit({
        kind: 'create',
        scope: workspace.id,
        entityId: id,
        payload: { ...input, id },
      });
    },
  });
}

/**
 * One Transaction that is not deleted, with its waiting changes applied. Until
 * the API answers it starts from a list already loaded, so it opens offline.
 */
export function useTransaction(transactionId: string): Loaded<Transaction> {
  const api = useApi();
  const queryClient = useQueryClient();
  const { me, workspace } = useSignedIn();
  const waiting = useWaitingChanges(workspace.id).filter((e) => e.entityId === transactionId);
  // Recorded on this device and maybe not on the server yet: nothing to ask it.
  const local = waiting.some((e) => e.kind === 'create');
  const query = useQuery({
    queryKey: [...transactionsKey(workspace.id), 'one', transactionId],
    queryFn: () => api.getTransaction(workspace.id, transactionId),
    enabled: !local,
    initialData: () =>
      queryClient
        .getQueriesData<unknown>({ queryKey: transactionsKey(workspace.id) })
        .flatMap(([, data]) => (Array.isArray(data) ? (data as Transaction[]) : []))
        .find((t) => t.id === transactionId),
    initialDataUpdatedAt: 0,
    // A missing or deleted one stays missing: asking again would not help.
    retry: false,
  });
  const missing = query.error instanceof ApiError && query.error.status === 404;
  const base = local || missing || !query.data ? [] : [query.data];
  const [data] = withWaitingChanges(base, waiting, {
    filters: {},
    calendar: workspace.calendar,
    categories: [],
    userId: me.user.id,
  }).transactions;
  return loaded(data, !local && !missing && query.isPending);
}

/** Member or above, a Member only their own. Saved now or once back online. */
export function useUpdateTransaction(transactionId: string) {
  const { workspace } = useSignedIn();
  const submit = useSubmit();
  return useMutation({
    networkMode: 'always',
    /** `version` is the server version the edit started from; a stale one fails with `EditConflict`. */
    mutationFn: ({ input, version }: { input: CreateTransactionInput; version: number }) =>
      submit({
        kind: 'update',
        scope: workspace.id,
        entityId: transactionId,
        payload: { ...input, id: transactionId },
        baseVersion: version,
      }),
  });
}

/** Settles an edit that ran into a newer copy: resend mine against it, or drop it for theirs. */
export function useSettleConflict() {
  const { queue } = useOfflineDevice();
  const { workspace } = useSignedIn();
  return (transactionId: string, pick: 'mine' | 'theirs') =>
    queue.resolve(workspace.id, transactionId, pick);
}

/** Drops a change the API refused, which only waits to be cleared. */
export function useDiscardChange() {
  const { queue } = useOfflineDevice();
  const { workspace } = useSignedIn();
  return (transactionId: string) => queue.discard(workspace.id, transactionId);
}

/** What undoing a delete needs. */
export interface Deleted {
  /** As it was shown, edits still waiting included. */
  transaction: Transaction;
  /** Recorded on this device and never sent, so the delete cancelled it outright. */
  unsent: boolean;
  /** Recorded on this device, maybe not on the server yet: undoing records it again. */
  local: boolean;
  /** Edits were waiting for it: undoing sends them again. */
  edited: boolean;
}

/** Member or above, a Member only their own. Gone at once; sent now or once back online. */
export function useDeleteTransaction() {
  const { queue } = useOfflineDevice();
  const { workspace } = useSignedIn();
  const submit = useSubmit();
  return useMutation({
    networkMode: 'always',
    mutationFn: async (transaction: Transaction): Promise<Deleted> => {
      // The delete replaces what waits for the Transaction; remember it for an undo.
      const waiting = queue.entriesFor(workspace.id, transaction.id);
      const unsent = waiting.some((e) => e.kind === 'create' && !e.attempted);
      const local = waiting.some((e) => e.kind === 'create');
      const edited = waiting.some((e) => e.kind === 'update');
      await submit({ kind: 'delete', scope: workspace.id, entityId: transaction.id });
      return { transaction, unsent, local, edited };
    },
  });
}

/**
 * Brings back a deleted Transaction: the undo of a delete. A delete still
 * waiting on this device is cancelled, and what it replaced is queued again;
 * restoring one the API has deleted needs it online.
 */
export function useRestoreTransaction() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { queue } = useOfflineDevice();
  const { workspace } = useSignedIn();
  const submit = useSubmit();
  return useMutation({
    networkMode: 'always',
    mutationFn: async ({ transaction, unsent, local, edited }: Deleted) => {
      const scope = workspace.id;
      const entityId = transaction.id;
      const payload = inputFromTransaction(transaction);
      if (unsent) {
        await submit({ kind: 'create', scope, entityId, payload });
        return;
      }
      if (await queue.discard(scope, entityId)) {
        if (local) await submit({ kind: 'create', scope, entityId, payload });
        else if (edited) {
          await submit({
            kind: 'update',
            scope,
            entityId,
            payload,
            baseVersion: transaction.version,
          });
        }
        return;
      }
      // The delete is on its way or done: let it land first, or it would undo the restore.
      await queue.replay();
      await api.restoreTransaction(scope, entityId);
      await refreshAfterChange(queryClient, scope);
    },
  });
}

/** The Accounts and Categories last used on this device, so the next Transaction starts from them. */
export interface LastPicks {
  accountId?: string;
  /** A Transfer's destination. */
  toAccountId?: string;
  categoryIds?: Partial<Record<TransactionType, string>>;
}

const lastPicksKey = (workspaceId: string) => `daric.lastPicks.${workspaceId}`;

// Storage may be unavailable (private windows, blocked site data): then nothing is remembered.
export function readLastPicks(workspaceId: string): LastPicks {
  try {
    const stored = localStorage.getItem(lastPicksKey(workspaceId));
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    return parsed && typeof parsed === 'object' ? (parsed as LastPicks) : {};
  } catch {
    return {};
  }
}

export function writeLastPicks(workspaceId: string, picks: LastPicks): void {
  try {
    localStorage.setItem(lastPicksKey(workspaceId), JSON.stringify(picks));
  } catch {
    // Not remembered; the next Transaction starts from the defaults.
  }
}
