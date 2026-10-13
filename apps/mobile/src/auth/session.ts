import { ApiError } from '@daric/api-client';
import type { LoginInput, Me, Workspace } from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useOfflineDevice } from '../offline/offline';

export const ME_QUERY_KEY = ['me'] as const;

/** The signed-in User and their Workspaces, or null when nobody is signed in. */
export function useMe() {
  const api = useApi();
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await api.me();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}

/**
 * The signed-in User and the Workspace they are looking at. Only for screens
 * under the signed-in layout, which renders them once `useMe` has a User.
 */
export function useSignedIn(): { me: Me; workspace: Workspace } {
  const { data: me } = useMe();
  // Every User has at least their Personal Workspace; switching Workspaces comes later.
  const workspace = me?.workspaces[0];
  if (!me || !workspace) throw new Error('useSignedIn must be used under the signed-in layout');
  return { me, workspace };
}

/** Signs in and records the answer to "Keep data on this device?". */
export function useLogin() {
  const api = useApi();
  const queryClient = useQueryClient();
  const device = useOfflineDevice();
  return useMutation({
    mutationFn: async ({ keep, ...input }: LoginInput & { keep: boolean }) => {
      await api.login(input);
      await device.setKeep(keep);
      await queryClient.resetQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

/**
 * Ends this Signed-in Device and wipes what it kept: the waiting changes (after
 * one last try to send them), the cached data and the "keep data" answer. The
 * tokens are forgotten even when the API cannot be told.
 */
export function useLogout() {
  const api = useApi();
  const queryClient = useQueryClient();
  const device = useOfflineDevice();
  return useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      await device.queue.replay();
      try {
        await api.logout();
      } catch {
        // Offline: the tokens are gone from this phone, so its session can no longer be used.
      } finally {
        await device.wipe();
        queryClient.setQueryData(ME_QUERY_KEY, null);
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_QUERY_KEY[0] });
      }
    },
  });
}
