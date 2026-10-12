import { periodParam } from '@daric/core';
import type { Period } from '@daric/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';

/** The query key every report query of a Workspace starts with. */
export const reportsKey = (workspaceId: string) => ['reports', workspaceId] as const;

/**
 * The report of `period`, worked out by the API. Transactions, Categories,
 * Labels and rates all feed it, so it is read afresh every time the screen opens.
 */
export function useReport(period: Period) {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...reportsKey(workspace.id), workspace.baseCurrency, periodParam(period)],
    queryFn: () => api.getReport(workspace.id, { period }),
    placeholderData: keepPreviousData,
  });
}
