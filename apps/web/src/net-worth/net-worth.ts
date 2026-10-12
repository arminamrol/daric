import type { CreateValuationInput } from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';

export const netWorthKey = (workspaceId: string) => ['net-worth', workspaceId] as const;
export const valuationsKey = (workspaceId: string, accountId: string) =>
  ['valuations', workspaceId, accountId] as const;

/**
 * Net Worth today, worked out by the API. Balances, Valuations and rates all
 * feed it, so it is read afresh every time the screen opens.
 */
export function useNetWorth() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...netWorthKey(workspace.id), workspace.baseCurrency],
    queryFn: () => api.getNetWorth(workspace.id),
  });
}

/** The Account's Valuations, newest first. */
export function useValuations(accountId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: valuationsKey(workspace.id, accountId),
    queryFn: () => api.listValuations(workspace.id, accountId),
  });
}

/** A changed Valuation changes Net Worth too. */
function useRefreshValuations(accountId: string) {
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: valuationsKey(workspace.id, accountId) }),
      queryClient.invalidateQueries({ queryKey: netWorthKey(workspace.id), refetchType: 'all' }),
    ]);
}

/** Owner or Admin only. */
export function useCreateValuation(accountId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshValuations(accountId);
  return useMutation({
    mutationFn: (input: CreateValuationInput) =>
      api.createValuation(workspace.id, accountId, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only. */
export function useDeleteValuation(accountId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshValuations(accountId);
  return useMutation({
    mutationFn: (valuationId: string) => api.deleteValuation(workspace.id, accountId, valuationId),
    onSuccess: refresh,
  });
}

export const snapshotsKey = (workspaceId: string) => ['net-worth-snapshots', workspaceId] as const;

/** Every Net Worth Snapshot, oldest first. */
export function useNetWorthHistory() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: snapshotsKey(workspace.id),
    queryFn: () => api.listNetWorthSnapshots(workspace.id),
  });
}

/** Member or above: stores today's Net Worth as a MANUAL snapshot. */
export function useTakeSnapshot() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return useMutation({
    mutationFn: () => api.takeNetWorthSnapshot(workspace.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: snapshotsKey(workspace.id) }),
  });
}
