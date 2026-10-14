import type {
  CreatePlannedItemInput,
  ProjectionMode,
  UpdatePlannedItemInput,
  UpdateProjectionSettingsInput,
} from '@daric/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { projectionKey } from '../data/keys';

/**
 * The Projection of the current year in `mode` (the Workspace's when left
 * out), worked out by the API.
 */
export function useProjection(mode?: ProjectionMode) {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...projectionKey(workspace.id), 'report', workspace.baseCurrency, mode ?? null],
    queryFn: () => api.getProjection(workspace.id, mode ? { mode } : {}),
    placeholderData: keepPreviousData,
  });
}

export function useProjectionSettings() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...projectionKey(workspace.id), 'settings'],
    queryFn: () => api.getProjectionSettings(workspace.id),
  });
}

/** Settings, Planned Items and every Projection worked out from them are read again. */
function useRefreshProjection() {
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return () =>
    queryClient.invalidateQueries({ queryKey: projectionKey(workspace.id), refetchType: 'all' });
}

/** Owner or Admin only; online only. */
export function useUpdateProjectionSettings() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshProjection();
  return useMutation({
    mutationFn: (input: UpdateProjectionSettingsInput) =>
      api.updateProjectionSettings(workspace.id, input),
    onSuccess: refresh,
  });
}

/** The Workspace's Planned Items, oldest first. */
export function usePlannedItems() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...projectionKey(workspace.id), 'planned-items'],
    queryFn: () => api.listPlannedItems(workspace.id),
  });
}

/** Owner or Admin only; online only. */
export function useCreatePlannedItem() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshProjection();
  return useMutation({
    mutationFn: (input: CreatePlannedItemInput) => api.createPlannedItem(workspace.id, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only; online only. */
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

/** Owner or Admin only; online only. */
export function useDeletePlannedItem(itemId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshProjection();
  return useMutation({
    mutationFn: () => api.deletePlannedItem(workspace.id, itemId),
    onSuccess: refresh,
  });
}
