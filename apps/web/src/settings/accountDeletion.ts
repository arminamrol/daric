import { useMutation, useQuery } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useForgetSession } from '../auth/logout';

export const ACCOUNT_DELETION_QUERY_KEY = ['accountDeletion'] as const;

/** What deleting the account would delete, and the shared Workspaces that block it. */
export function useAccountDeletion() {
  const api = useApi();
  return useQuery({
    queryKey: ACCOUNT_DELETION_QUERY_KEY,
    queryFn: () => api.accountDeletion(),
  });
}

/**
 * Deletes the account with the password given again, then wipes this device
 * as a logout does; changes still waiting to be sent are dropped with it.
 */
export function useDeleteAccount() {
  const api = useApi();
  const forget = useForgetSession();
  return useMutation({
    mutationFn: async (password: string) => {
      await api.deleteAccount(password);
      await forget();
    },
  });
}
