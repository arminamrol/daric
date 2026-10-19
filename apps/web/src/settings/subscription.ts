import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { leave } from '../lib/leave';

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

export const PAYMENTS_QUERY_KEY = ['payments'] as const;

/** What 1 to 12 months of Plus cost, as the server prices them. */
export function usePlusPrices(enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: ['plus-prices'],
    queryFn: () => api.listPlusPrices(),
    enabled,
  });
}

/** Starts buying `months` of Plus and sends the browser to the payment provider. */
export function useCheckout() {
  const api = useApi();
  return useMutation({
    mutationFn: (months: number) => api.checkout({ months }),
    onSuccess: ({ redirectUrl }) => leave.to(redirectUrl),
  });
}

/** The User's finished Payments, newest first. */
export function usePayments() {
  const api = useApi();
  return useQuery({ queryKey: PAYMENTS_QUERY_KEY, queryFn: () => api.listPayments() });
}

/** One Payment, as the page the provider sent the browser back to asks about it. */
export function usePayment(paymentId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...PAYMENTS_QUERY_KEY, paymentId],
    queryFn: () => api.getPayment(paymentId ?? ''),
    enabled: paymentId !== null,
  });
}
