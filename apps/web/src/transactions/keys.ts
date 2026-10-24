import type { QueryClient } from '@tanstack/react-query';
import { accountsKey } from '../accounts/accounts';
import { budgetsKey } from '../budgets/budgets';

/** The query key every Transaction query of a Workspace starts with. */
export const transactionsKey = (workspaceId: string) => ['transactions', workspaceId] as const;

/**
 * Refetches a Workspace's Transactions, Account balances and Budget progress after a change,
 * including lists no screen shows right now, so the page a save navigates to is current.
 */
export async function refreshAfterChange(queryClient: QueryClient, workspaceId: string) {
  const keys = [transactionsKey(workspaceId), accountsKey(workspaceId), budgetsKey(workspaceId)];
  // A refetch waits on a first fetch still in flight instead of starting again, and that one
  // may have read the data from before the change: it is cancelled first.
  await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
  await Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey, refetchType: 'all' })),
  );
}
