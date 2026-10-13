import type { QueryClient } from '@tanstack/react-query';

/** The query key every Transaction query of a Workspace starts with. */
export const transactionsKey = (workspaceId: string) => ['transactions', workspaceId] as const;
export const accountsKey = (workspaceId: string) => ['accounts', workspaceId] as const;
export const categoriesKey = (workspaceId: string) => ['categories', workspaceId] as const;

/** Refetches a Workspace's Transactions and Account balances after a change. */
export function refreshAfterChange(queryClient: QueryClient, workspaceId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: transactionsKey(workspaceId), refetchType: 'all' }),
    queryClient.invalidateQueries({ queryKey: accountsKey(workspaceId), refetchType: 'all' }),
  ]);
}
