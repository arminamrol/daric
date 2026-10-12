import type { UpdateProjectionSettingsInput } from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';

/** The query key every Projection query of a Workspace starts with. */
export const projectionKey = (workspaceId: string) => ['projection', workspaceId] as const;

/**
 * The Automatic Projection of the current year, worked out by the API.
 * Transactions, rules and rates all feed it, so it is read afresh every time
 * the screen opens.
 */
export function useProjection() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...projectionKey(workspace.id), 'report', workspace.baseCurrency],
    queryFn: () => api.getProjection(workspace.id),
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

/** Owner or Admin only; the Projection is worked out again with the new settings. */
export function useUpdateProjectionSettings() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return useMutation({
    mutationFn: (input: UpdateProjectionSettingsInput) =>
      api.updateProjectionSettings(workspace.id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectionKey(workspace.id) }),
  });
}
