import type { CreatePlannedItemInput, UpdatePlannedItemInput } from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { projectionKey } from './projection';

/** The Workspace's Planned Items, oldest first. */
export function usePlannedItems() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...projectionKey(workspace.id), 'planned-items'],
    queryFn: () => api.listPlannedItems(workspace.id),
  });
}

/** The items and every Projection worked out from them are read again. */
function useRefreshProjection() {
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return () =>
    queryClient.invalidateQueries({ queryKey: projectionKey(workspace.id), refetchType: 'all' });
}

/** Owner or Admin only. */
export function useCreatePlannedItem() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshProjection();
  return useMutation({
    mutationFn: (input: CreatePlannedItemInput) => api.createPlannedItem(workspace.id, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only. */
export function useUpdatePlannedItem(itemId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshProjection();
  return useMutation({
    mutationFn: (input: UpdatePlannedItemInput) =>
      api.updatePlannedItem(workspace.id, itemId, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only. */
export function useDeletePlannedItem(itemId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshProjection();
  return useMutation({
    mutationFn: () => api.deletePlannedItem(workspace.id, itemId),
    onSuccess: refresh,
  });
}
