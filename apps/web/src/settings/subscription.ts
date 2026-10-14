import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/api';

export const SUBSCRIPTION_QUERY_KEY = ['subscription'] as const;

/** The User's Plan and Entitlements, as the server decides them; never worked out here. */
export function useSubscription() {
  const api = useApi();
  return useQuery({ queryKey: SUBSCRIPTION_QUERY_KEY, queryFn: () => api.getSubscription() });
}
