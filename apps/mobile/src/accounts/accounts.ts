import { withWaitingAccounts } from '@daric/api-client';
import { findCurrency, IRR } from '@daric/core';
import type { Account, Currency } from '@daric/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { accountsKey } from '../data/keys';
import { useWaitingWrites } from '../offline/offline';

/** The currency of `account`; rials while it is not known (not loaded yet). */
export function currencyOf(account: Pick<Account, 'currency'> | undefined): Currency {
  return (account && findCurrency(account.currency)) ?? IRR;
}

/**
 * The Workspace's Accounts in the order made, with the changes still waiting
 * to be sent shown on top and their states; archived ones only when asked, as
 * old Transactions name them. A list from an earlier fetch (or start) is
 * still shown when a refetch fails.
 */
export function useAccounts({ includeArchived = false }: { includeArchived?: boolean } = {}) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const query = useQuery({
    queryKey: [...accountsKey(workspace.id), { includeArchived }],
    queryFn: () => api.listAccounts(workspace.id, { includeArchived }),
  });
  const waiting = useWaitingWrites(workspace.id);
  const shown = useMemo(
    () => query.data && withWaitingAccounts(query.data, waiting, { includeArchived }),
    [query.data, waiting, includeArchived],
  );
  return { ...query, data: shown?.items, states: shown?.states };
}
