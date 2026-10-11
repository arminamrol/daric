import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useOfflineDevice } from '../offline/offline';
import { markLogoutPending, ME_QUERY_KEY } from './session';

/**
 * Ends this Signed-in Device and wipes what it kept: the waiting changes (after
 * one last try to send them), the cached data and the "keep data" answer.
 * Offline the API cannot be told yet, but the device is wiped all the same.
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
      } catch (error) {
        // Offline: the API is told on the next visit, which starts signed out.
        markLogoutPending();
        throw error;
      } finally {
        await device.wipe();
        // Signed out: the session gate sends the visitor to login. The query
        // the header watches stays; everything else held in memory goes.
        queryClient.setQueryData(ME_QUERY_KEY, null);
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_QUERY_KEY[0] });
      }
    },
  });
}
