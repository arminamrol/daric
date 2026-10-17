import { ApiError } from '@daric/api-client';
import type { LoginInput, Me, Workspace } from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent } from 'react';
import { finishPendingLogout, logOut, onSignedOut, useApi } from '../api/api';
import { useOfflineDevice } from '../offline/offline';

export const ME_QUERY_KEY = ['me'] as const;

/** The signed-in User and their Workspaces, or null when nobody is signed in. */
export function useMe() {
  const api = useApi();
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<Me | null> => {
      // Off the critical path: a logout made offline is finished when the API can be reached.
      void finishPendingLogout();
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
      const { user } = await api.login(input);
      await device.signedIn(user.id, keep);
      await queryClient.resetQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

/**
 * Wipes what this phone kept of the signed-in User: the waiting changes, the
 * cached data and the "keep data" answer. Signed out, the app shows login.
 */
function useForgetSession(): () => Promise<void> {
  const queryClient = useQueryClient();
  const device = useOfflineDevice();
  return async () => {
    await device.wipe();
    queryClient.setQueryData(ME_QUERY_KEY, null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_QUERY_KEY[0] });
  };
}

/**
 * Ends this Signed-in Device and wipes what it kept, after one last try to
 * send the waiting changes. The tokens are forgotten even when the API cannot
 * be told; it is told later.
 */
export function useLogout() {
  const api = useApi();
  const device = useOfflineDevice();
  const forget = useForgetSession();
  return useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      await device.queue.replay();
      try {
        await logOut(api);
      } finally {
        await forget();
      }
    },
  });
}

/**
 * Wipes the phone, as on logout, whenever the API signs it out: a login
 * elsewhere went past the device Entitlement, the User signed it out from
 * another device, or its refresh token expired.
 */
export function useForgetWhenSignedOut(): void {
  const forget = useForgetSession();
  const signedOut = useEffectEvent(() => void forget());
  useEffect(() => onSignedOut(signedOut), []);
}
