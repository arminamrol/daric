import { findCurrency, money } from '@daric/core';
import type { Account, CreateAccountInput, Currency, Money, UpdateAccountInput } from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';

const accountsKey = (workspaceId: string) => ['accounts', workspaceId] as const;

/** The Workspace's Accounts; archived ones only when asked. */
export function useAccounts({ includeArchived = false }: { includeArchived?: boolean } = {}) {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...accountsKey(workspace.id), { includeArchived }],
    queryFn: () => api.listAccounts(workspace.id, { includeArchived }),
  });
}

/**
 * Refetches every Account list, including ones no screen shows right now, so
 * the page a save navigates to never draws the list from before the save.
 */
export function useRefreshAccounts() {
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return () =>
    queryClient.invalidateQueries({ queryKey: accountsKey(workspace.id), refetchType: 'all' });
}

/** Owner or Admin only. */
export function useCreateAccount() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => api.createAccount(workspace.id, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only; also archives and unarchives. */
export function useUpdateAccount(accountId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshAccounts();
  return useMutation({
    mutationFn: (input: UpdateAccountInput) => api.updateAccount(workspace.id, accountId, input),
    onSuccess: refresh,
  });
}

/** The currency an Account is kept in; the API only takes currencies core knows. */
export function currencyOf(account: Pick<Account, 'currency'>): Currency {
  const currency = findCurrency(account.currency);
  if (!currency) throw new Error(`Unknown currency ${account.currency}`);
  return currency;
}

export function balanceOf(account: Account): Money {
  return money(account.balance, currencyOf(account));
}
