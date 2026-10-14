import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { Database, Transaction } from './client';

export interface WorkspaceScope {
  userId: string;
  workspaceId: string;
}

interface Scope {
  tx: Transaction;
  /** Run once the transaction has committed; dropped if it rolls back. */
  afterCommit: (() => void)[];
}

const current = new AsyncLocalStorage<Scope>();

/**
 * Runs `fn` in a transaction as the `daric_app` role with the User and
 * Workspace set locally, so row-level security limits every query to that
 * Workspace, and only if the User is a Member of it (ADR-0001).
 */
export async function runInWorkspace<T>(
  db: Database,
  scope: WorkspaceScope,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const afterCommit: (() => void)[] = [];
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE daric_app`);
    await tx.execute(
      sql`SELECT set_config('app.user_id', ${scope.userId}, true), set_config('app.workspace_id', ${scope.workspaceId}, true)`,
    );
    return current.run({ tx, afterCommit }, () => fn(tx));
  });
  for (const run of afterCommit) run();
  return result;
}

/** The transaction of the Workspace-scoped request being handled. */
export function scopedTx(): Transaction {
  return scope().tx;
}

/**
 * Runs `fn` once the Workspace-scoped request's transaction has committed,
 * e.g. to send mail about what it stored; never if it rolls back.
 */
export function afterScopedCommit(fn: () => void): void {
  scope().afterCommit.push(fn);
}

function scope(): Scope {
  const found = current.getStore();
  if (!found)
    throw new Error('No Workspace scope: this code must run inside a /v1/workspaces/:wsId route');
  return found;
}
