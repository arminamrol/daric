import { isTransactionEntry, withWaitingChanges } from '@daric/api-client';
import type { SyncState } from '@daric/api-client';
import type { ListTransactionsQuery, Transaction } from '@daric/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { useCategories } from '../categories/categories';
import { transactionsKey } from '../data/keys';
import { useWaitingWrites } from '../offline/offline';

const NO_STATES: ReadonlyMap<string, SyncState> = new Map();

/**
 * The Workspace's Transactions matching `filters`, newest first, with the
 * changes still waiting to be sent shown on top and their states. A list
 * from an earlier fetch (or start) is still shown when a refetch fails.
 */
export function useTransactions(filters: ListTransactionsQuery) {
  const api = useApi();
  const { me, workspace } = useSignedIn();
  const query = useQuery({
    queryKey: [...transactionsKey(workspace.id), filters],
    queryFn: () => api.listTransactions(workspace.id, filters),
  });
  const categories = useCategories();
  const writes = useWaitingWrites(workspace.id);
  const waiting = useMemo(() => writes.filter(isTransactionEntry), [writes]);
  const shown = useMemo(
    () =>
      query.data &&
      withWaitingChanges(query.data, waiting, {
        filters,
        calendar: workspace.calendar,
        categories: categories.data ?? [],
        userId: me.user.id,
      }),
    [query.data, waiting, filters, workspace.calendar, categories.data, me.user.id],
  );
  return {
    transactions: shown?.transactions as Transaction[] | undefined,
    states: shown?.states ?? NO_STATES,
    isPending: query.isPending,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}
