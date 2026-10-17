import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent } from 'react';
import { useApi } from '../api/api';
import { useOfflineDevice } from '../offline/offline';
import { currentWorkspace, logoutPending, ME_QUERY_KEY } from './session';
import { hasSignedIn, onSignedOut } from './signedOut';

/**
 * Wipes what this device kept of the signed-in User: the waiting changes, the
 * cached data, the "keep data" answer and the chosen Workspace. Signed out,
 * the session gate sends the visitor to login.
 */
export function useForgetSession(): () => Promise<void> {
  const queryClient = useQueryClient();
  const device = useOfflineDevice();
  return async () => {
    await device.wipe();
    hasSignedIn.set(false);
    currentWorkspace.set(null);
    // The query the header watches stays; everything else held in memory goes.
    queryClient.setQueryData(ME_QUERY_KEY, null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_QUERY_KEY[0] });
  };
}

/**
 * Ends this Signed-in Device and wipes what it kept, after one last try to
 * send the waiting changes. Offline the API cannot be told yet, but the device
 * is wiped all the same.
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
        await api.logout();
      } catch (error) {
        // Offline: the API is told on the next visit, which starts signed out.
        logoutPending.set(true);
        throw error;
      } finally {
        await forget();
      }
    },
  });
}

/**
 * Wipes the device, as on logout, whenever the API signs it out: another login
 * went past the device Entitlement, the User signed it out elsewhere, or its
 * refresh token expired. Changes still waiting are lost, as the server no longer
 * takes them from this device.
 */
export function useForgetWhenSignedOut(): void {
  const forget = useForgetSession();
  const signedOut = useEffectEvent(() => void forget());
  useEffect(() => onSignedOut(signedOut), []);
}
