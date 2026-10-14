import type { CreateTransactionInput, Transaction } from '@daric/core';
import type { Change, SendResult, Transport } from '@daric/offline-queue';
import { ApiError, transactionConflict } from './client';
import type { ApiClient } from './client';

/** A Transaction change waiting to reach the API; the scope is its Workspace. */
export type TransactionChange = Change<CreateTransactionInput>;

/** Answers worth trying again later: the session lapsed, or the server was busy or down. */
const retryable = (status: number) =>
  status === 401 || status === 408 || status === 429 || status >= 500;

/**
 * The API's refusal in `error`. Rethrows what is worth trying again later:
 * the network failing, a lapsed session, a busy or broken server.
 */
export function refusalOf(error: unknown): ApiError {
  if (!(error instanceof ApiError) || retryable(error.status)) throw error;
  return error;
}

/** Sends one queued Transaction change; throws when it should be tried again later. */
export async function sendTransaction(
  api: ApiClient,
  change: TransactionChange,
): Promise<SendResult<Transaction>> {
  try {
    switch (change.kind) {
      case 'create':
        await api.createTransaction(change.scope, { ...change.payload, id: change.entityId });
        break;
      case 'update': {
        const { id: _, ...fields } = change.payload;
        const saved = await api.updateTransaction(change.scope, change.entityId, {
          ...fields,
          version: change.baseVersion,
        });
        return { status: 'done', version: saved.version };
      }
      case 'delete':
        await api.deleteTransaction(change.scope, change.entityId);
        break;
    }
    return { status: 'done' };
  } catch (error) {
    const current = transactionConflict(error);
    if (current) return { status: 'conflict', current, version: current.version };
    const refusal = refusalOf(error);
    if (refusal.status === 404 && change.kind !== 'create') {
      // Deleted meanwhile: deletes win.
      return change.kind === 'update' ? { status: 'gone' } : { status: 'done' };
    }
    return { status: 'rejected', reason: refusal.message };
  }
}

/**
 * Sends queued Transaction changes with the API client. `afterChange` runs once
 * the server took one (or answered with a newer copy), before the queue lets
 * go of it, so lists refetch without the change briefly vanishing.
 */
export function transactionTransport(
  api: ApiClient,
  afterChange: (workspaceId: string) => Promise<unknown>,
): Transport<CreateTransactionInput, Transaction> {
  return {
    async send(change) {
      const result = await sendTransaction(api, change);
      // Lists refetch when the server changed; a gone or refused change left them as they were.
      if (result.status === 'done' || result.status === 'conflict') {
        await afterChange(change.scope);
      }
      return result;
    },
  };
}
