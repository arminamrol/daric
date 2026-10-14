import type { Entity } from '@daric/api-client';
import type { QueryClient } from '@tanstack/react-query';

/** The query key every query of one kind in a Workspace starts with. */
export const transactionsKey = (workspaceId: string) => ['transactions', workspaceId] as const;
export const accountsKey = (workspaceId: string) => ['accounts', workspaceId] as const;
export const categoriesKey = (workspaceId: string) => ['categories', workspaceId] as const;
export const labelsKey = (workspaceId: string) => ['labels', workspaceId] as const;
export const budgetsKey = (workspaceId: string) => ['budgets', workspaceId] as const;
/** Recurring Rules and Due Occurrences. */
export const recurringKey = (workspaceId: string) => ['recurring', workspaceId] as const;
// Net Worth, the Projection and reports are worked out by the API from
// everything else, so they are read afresh whenever their screen opens rather
// than after each write; their own changes are sent online only.
export const netWorthKey = (workspaceId: string) => ['net-worth', workspaceId] as const;
export const snapshotsKey = (workspaceId: string) => ['net-worth-snapshots', workspaceId] as const;
export const valuationsKey = (workspaceId: string, accountId: string) =>
  ['valuations', workspaceId, accountId] as const;
/** The Projection, its settings and the Planned Items. */
export const projectionKey = (workspaceId: string) => ['projection', workspaceId] as const;
export const reportsKey = (workspaceId: string) => ['reports', workspaceId] as const;

/**
 * What a write changes besides its own list: a Transaction moves balances
 * and Budgets; confirming a Due Occurrence records a Transaction.
 */
const TOUCHES: Record<Entity, readonly ((workspaceId: string) => readonly unknown[])[]> = {
  transaction: [transactionsKey, accountsKey, budgetsKey],
  account: [accountsKey],
  category: [categoriesKey],
  categoryOrder: [categoriesKey],
  label: [labelsKey],
  budget: [budgetsKey],
  recurringRule: [recurringKey],
  occurrence: [recurringKey, transactionsKey, accountsKey, budgetsKey],
};

/** Refetches, even with no screen showing them, the lists a write of `entity` changed. */
export function refreshAfterWrite(queryClient: QueryClient, workspaceId: string, entity: Entity) {
  return Promise.all(
    TOUCHES[entity].map((key) =>
      queryClient.invalidateQueries({ queryKey: key(workspaceId), refetchType: 'all' }),
    ),
  );
}
