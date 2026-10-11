import type {
  CreateTransactionInput,
  ListTransactionsQuery,
  TransactionType,
  UpdateTransactionInput,
} from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRefreshAccounts } from '../accounts/accounts';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';

const transactionsKey = (workspaceId: string) => ['transactions', workspaceId] as const;

/** The Workspace's Transactions matching `filters`, newest first. */
export function useTransactions(filters: ListTransactionsQuery) {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...transactionsKey(workspace.id), filters],
    queryFn: () => api.listTransactions(workspace.id, filters),
  });
}

/** Member or above. Lists and Account balances are refetched once it is recorded. */
export function useRecordTransaction() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => api.createTransaction(workspace.id, input),
    onSuccess: refresh,
  });
}

/** One Transaction that is not deleted. */
export function useTransaction(transactionId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...transactionsKey(workspace.id), 'one', transactionId],
    queryFn: () => api.getTransaction(workspace.id, transactionId),
    // A missing or deleted one stays missing: asking again would not help.
    retry: false,
  });
}

/** Refetches Transactions and Account balances after a change. */
function useRefreshAfterChange() {
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  const refreshAccounts = useRefreshAccounts();
  return () =>
    Promise.all([
      // Also lists no screen shows right now, so the page a save navigates to is current.
      queryClient.invalidateQueries({
        queryKey: transactionsKey(workspace.id),
        refetchType: 'all',
      }),
      refreshAccounts(),
    ]);
}

/** Member or above, a Member only their own. A stale version fails with the current copy. */
export function useUpdateTransaction(transactionId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (input: UpdateTransactionInput) =>
      api.updateTransaction(workspace.id, transactionId, input),
    onSuccess: refresh,
  });
}

/** Member or above, a Member only their own. */
export function useDeleteTransaction() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (transactionId: string) => api.deleteTransaction(workspace.id, transactionId),
    onSuccess: refresh,
  });
}

/** Brings back a deleted Transaction: the undo of a delete. */
export function useRestoreTransaction() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (transactionId: string) => api.restoreTransaction(workspace.id, transactionId),
    onSuccess: refresh,
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
