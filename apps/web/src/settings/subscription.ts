import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';

export const SUBSCRIPTION_QUERY_KEY = ['subscription'] as const;
export const DEVICES_QUERY_KEY = ['devices'] as const;

/** The User's Plan and Entitlements, as the server decides them; never worked out here. */
export function useSubscription() {
  const api = useApi();
  return useQuery({ queryKey: SUBSCRIPTION_QUERY_KEY, queryFn: () => api.getSubscription() });
}

/** The User's Signed-in Devices, most recently used first. */
export function useSignedInDevices() {
  const api = useApi();
  return useQuery({ queryKey: DEVICES_QUERY_KEY, queryFn: () => api.listDevices() });
}

/** Signs one of the User's other devices out; its next refresh is refused. */
export function useSignOutDevice() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) => api.signOutDevice(deviceId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY }),
  });
}
