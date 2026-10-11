import { ApiError, transactionConflict } from '@daric/api-client';
import type { ApiClient } from '@daric/api-client';
import type { CreateTransactionInput, Transaction } from '@daric/core';
import type { Change, SendResult, Transport } from '@daric/offline-queue';

/** A Transaction change waiting to reach the API; the scope is its Workspace. */
export type TransactionChange = Change<CreateTransactionInput>;

/** Answers worth trying again later: the session lapsed, or the server was busy or down. */
const retryable = (status: number) =>
  status === 401 || status === 408 || status === 429 || status >= 500;

/**
 * Sends queued Transaction changes with the API client. `afterChange` runs once
 * the server took one (or answered with a newer copy), before the queue lets
 * go of it, so lists refetch without the change briefly vanishing.
 */
export function transactionTransport(
  api: ApiClient,
  afterChange: (workspaceId: string) => Promise<unknown>,
): Transport<CreateTransactionInput, Transaction> {
  async function apply(change: TransactionChange): Promise<SendResult<Transaction>> {
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
      if (!(error instanceof ApiError)) throw error; // the network: try again later
      const current = transactionConflict(error);
      if (current) return { status: 'conflict', current, version: current.version };
      if (error.status === 404 && change.kind !== 'create') {
        // Deleted meanwhile: deletes win.
        return change.kind === 'update' ? { status: 'gone' } : { status: 'done' };
      }
      if (retryable(error.status)) throw error;
      return { status: 'rejected', reason: `API answered ${error.status}` };
    }
  }

  return {
    async send(change) {
      const result = await apply(change);
      // Lists refetch when the server changed; a gone or refused change left them as they were.
      if (result.status === 'done' || result.status === 'conflict') {
        await afterChange(change.scope);
      }
      return result;
    },
  };
}
