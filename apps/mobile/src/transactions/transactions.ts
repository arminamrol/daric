import { withWaitingChanges } from '@daric/api-client';
import type { SyncState } from '@daric/api-client';
import { findCurrency, IRR } from '@daric/core';
import type {
  Account,
  CreateTransactionInput,
  Currency,
  ListTransactionsQuery,
  Transaction,
} from '@daric/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getRandomBytes } from 'expo-crypto';
import { useMemo } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { useOfflineDevice, useWaitingChanges } from '../offline/offline';
import { accountsKey, categoriesKey, transactionsKey } from './keys';

/** The currency of `account`; rials while it is not known (not loaded yet). */
export function currencyOf(account: Pick<Account, 'currency'> | undefined): Currency {
  return (account && findCurrency(account.currency)) ?? IRR;
}

/** A new UUIDv7, so a create replayed from the queue is recognised by the API. */
export const newId = () => uuidv7({ random: getRandomBytes(16) });

/** The Workspace's Accounts; archived ones only when asked, as old Transactions name them. */
export function useAccounts({ includeArchived = false }: { includeArchived?: boolean } = {}) {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...accountsKey(workspace.id), { includeArchived }],
    queryFn: () => api.listAccounts(workspace.id, { includeArchived }),
  });
}

/** The Workspace's Categories, archived ones too: old Transactions still name them. */
export function useCategories() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: categoriesKey(workspace.id),
    queryFn: () => api.listCategories(workspace.id, { includeArchived: true }),
  });
}

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
  const waiting = useWaitingChanges(workspace.id);
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

/** The API refused the change for good; it is dropped from the queue. */
export class ChangeRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ChangeRefused';
  }
}

/** Member or above. Shown at once; sent now, or once the phone is back online. */
export function useRecordTransaction() {
  const { queue } = useOfflineDevice();
  const { workspace } = useSignedIn();
  return useMutation({
    // The queue decides when it can send; the mutation must not wait for the network.
    networkMode: 'always',
    mutationFn: async (input: CreateTransactionInput & { id: string }) => {
      const outcome = await queue.submit({
        kind: 'create',
        scope: workspace.id,
        entityId: input.id,
        payload: input,
      });
      switch (outcome.status) {
        case 'synced':
        case 'queued':
          return outcome.status;
        default:
          // Refused, or (not expected of a create) a conflict or gone: it waits no longer.
          await queue.discard(workspace.id, input.id);
          throw new ChangeRefused(outcome.status === 'rejected' ? outcome.reason : outcome.status);
      }
    },
  });
}
