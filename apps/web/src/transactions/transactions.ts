import type { CreateTransactionInput, ListTransactionsQuery, TransactionType } from '@daric/core';
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
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  const refreshAccounts = useRefreshAccounts();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => api.createTransaction(workspace.id, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionsKey(workspace.id) }),
        refreshAccounts(),
      ]),
  });
}

/** The Account and Categories last used on this device, so the next Transaction starts from them. */
export interface LastPicks {
  accountId?: string;
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
