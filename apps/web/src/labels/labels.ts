import type { CreateLabelInput, UpdateLabelInput } from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';

const labelsKey = (workspaceId: string) => ['labels', workspaceId] as const;

/**
 * The Workspace's Labels by name, archived ones included (old Transactions
 * still carry them); screens filter them out where only active ones belong.
 */
export function useLabels() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: labelsKey(workspace.id),
    queryFn: () => api.listLabels(workspace.id, { includeArchived: true }),
  });
}

/** Refetches even when no screen shows the list, so the page a save navigates to is current. */
function useRefreshLabels() {
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return () =>
    queryClient.invalidateQueries({ queryKey: labelsKey(workspace.id), refetchType: 'all' });
}

/** Owner or Admin only. */
export function useCreateLabel() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshLabels();
  return useMutation({
    mutationFn: (input: CreateLabelInput) => api.createLabel(workspace.id, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only; also flags, archives and unarchives. */
export function useUpdateLabel(labelId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshLabels();
  return useMutation({
    mutationFn: (input: UpdateLabelInput) => api.updateLabel(workspace.id, labelId, input),
    onSuccess: refresh,
  });
}
