import type { CreateRecurringRuleInput, UpdateRecurringRuleInput } from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { refreshAfterChange } from '../transactions/keys';

/** The query key every Recurring Rule and Due Occurrence query of a Workspace starts with. */
export const recurringKey = (workspaceId: string) => ['recurring', workspaceId] as const;

/** The Workspace's Recurring Rules, oldest first, archived ones included: filter on screen. */
export function useRecurringRules() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...recurringKey(workspace.id), 'rules'],
    queryFn: () => api.listRecurringRules(workspace.id, { includeArchived: true }),
  });
}

/**
 * The Due Occurrences, oldest first. Asking records those of auto-posting
 * rules, so when it did, Transactions, balances and Budgets are refetched.
 */
export function useDueOccurrences() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...recurringKey(workspace.id), 'due'],
    queryFn: async () => {
      const due = await api.listDueOccurrences(workspace.id);
      if (due.autoPosted > 0) void refreshAfterChange(queryClient, workspace.id);
      return due;
    },
  });
}

function useRefreshRecurring() {
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return () =>
    queryClient.invalidateQueries({ queryKey: recurringKey(workspace.id), refetchType: 'all' });
}

/** Owner or Admin only. */
export function useCreateRecurringRule() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshRecurring();
  return useMutation({
    mutationFn: (input: CreateRecurringRuleInput) => api.createRecurringRule(workspace.id, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only. */
export function useUpdateRecurringRule(ruleId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshRecurring();
  return useMutation({
    mutationFn: (input: UpdateRecurringRuleInput) =>
      api.updateRecurringRule(workspace.id, ruleId, input),
    onSuccess: refresh,
  });
}

/** Which occurrence to confirm or skip, and on confirming, the Amount if not the rule's. */
export interface OccurrenceAction {
  ruleId: string;
  dueOn: string;
  amount?: bigint;
}

/** Member or above. Records the occurrence as a Transaction. */
export function useConfirmOccurrence() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  const refresh = useRefreshRecurring();
  return useMutation({
    mutationFn: ({ ruleId, dueOn, amount }: OccurrenceAction) =>
      api.confirmOccurrence(workspace.id, ruleId, dueOn, amount === undefined ? {} : { amount }),
    onSuccess: () => Promise.all([refresh(), refreshAfterChange(queryClient, workspace.id)]),
  });
}

/** Member or above. */
export function useSkipOccurrence() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshRecurring();
  return useMutation({
    mutationFn: ({ ruleId, dueOn }: OccurrenceAction) =>
      api.skipOccurrence(workspace.id, ruleId, dueOn),
    onSuccess: refresh,
  });
}
