import { withWaitingDue, withWaitingRules } from '@daric/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { recurringKey, refreshAfterWrite } from '../data/keys';
import { useWaitingWrites } from '../offline/offline';

/**
 * The Workspace's Recurring Rules, oldest first, archived ones included
 * (filter on screen), with the changes still waiting to be sent shown on top
 * and their states.
 */
export function useRecurringRules() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const query = useQuery({
    queryKey: [...recurringKey(workspace.id), 'rules'],
    queryFn: () => api.listRecurringRules(workspace.id, { includeArchived: true }),
  });
  const waiting = useWaitingWrites(workspace.id);
  const shown = useMemo(
    () => query.data && withWaitingRules(query.data, waiting),
    [query.data, waiting],
  );
  return { ...query, data: shown?.items, states: shown?.states };
}

/**
 * The Due Occurrences, oldest first, less those confirmed or skipped on this
 * phone and not sent yet. Asking records those of auto-posting rules, so when
 * it did, Transactions, balances and Budgets are refetched.
 */
export function useDueOccurrences() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  const query = useQuery({
    queryKey: [...recurringKey(workspace.id), 'due'],
    queryFn: async () => {
      const due = await api.listDueOccurrences(workspace.id);
      if (due.autoPosted > 0) void refreshAfterWrite(queryClient, workspace.id, 'occurrence');
      return due;
    },
  });
  const waiting = useWaitingWrites(workspace.id);
  const shown = useMemo(
    () => query.data && withWaitingDue(query.data.occurrences, waiting),
    [query.data, waiting],
  );
  return { ...query, data: shown };
}
