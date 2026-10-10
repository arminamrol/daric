import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { Database, Transaction } from './client';

export interface WorkspaceScope {
  userId: string;
  workspaceId: string;
}

const current = new AsyncLocalStorage<Transaction>();

/**
 * Runs `fn` in a transaction as the `daric_app` role with the User and
 * Workspace set locally, so row-level security limits every query to that
 * Workspace, and only if the User is a Member of it (ADR-0001).
 */
export function runInWorkspace<T>(
  db: Database,
  scope: WorkspaceScope,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE daric_app`);
    await tx.execute(
      sql`SELECT set_config('app.user_id', ${scope.userId}, true), set_config('app.workspace_id', ${scope.workspaceId}, true)`,
    );
    return current.run(tx, () => fn(tx));
  });
}

/** The transaction of the Workspace-scoped request being handled. */
export function scopedTx(): Transaction {
  const tx = current.getStore();
  if (!tx)
    throw new Error('No Workspace scope: this code must run inside a /v1/workspaces/:wsId route');
  return tx;
}
