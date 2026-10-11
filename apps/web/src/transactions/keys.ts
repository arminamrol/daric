import type { QueryClient } from '@tanstack/react-query';
import { accountsKey } from '../accounts/accounts';

/** The query key every Transaction query of a Workspace starts with. */
export const transactionsKey = (workspaceId: string) => ['transactions', workspaceId] as const;

/**
 * Refetches a Workspace's Transactions and Account balances after a change,
 * including lists no screen shows right now, so the page a save navigates to is current.
 */
export function refreshAfterChange(queryClient: QueryClient, workspaceId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: transactionsKey(workspaceId), refetchType: 'all' }),
    queryClient.invalidateQueries({ queryKey: accountsKey(workspaceId), refetchType: 'all' }),
  ]);
}
