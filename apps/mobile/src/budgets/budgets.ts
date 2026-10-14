import { withWaitingBudgets } from '@daric/api-client';
import type { MonthPeriod } from '@daric/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { budgetsKey } from '../data/keys';
import { useWaitingWrites } from '../offline/offline';

/**
 * The Workspace's Budgets, oldest first, each with its progress in `month`
 * (or the year holding it, for a yearly Budget), with the changes still
 * waiting to be sent shown on top and their states.
 */
export function useBudgets(month: MonthPeriod) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const query = useQuery({
    queryKey: [...budgetsKey(workspace.id), month.year, month.month],
    queryFn: () => api.listBudgets(workspace.id, { month }),
  });
  const waiting = useWaitingWrites(workspace.id);
  const shown = useMemo(
    () =>
      query.data &&
      withWaitingBudgets(query.data, waiting, { currency: workspace.baseCurrency, month }),
    [query.data, waiting, workspace.baseCurrency, month],
  );
  return { ...query, data: shown?.items, states: shown?.states };
}
