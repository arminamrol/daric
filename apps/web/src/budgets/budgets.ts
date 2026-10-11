import type { CreateBudgetInput, MonthPeriod, UpdateBudgetInput } from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';

/** The query key every Budget query of a Workspace starts with. */
export const budgetsKey = (workspaceId: string) => ['budgets', workspaceId] as const;

/**
 * The Workspace's Budgets, oldest first, each with its progress in `month`
 * (or the year holding it, for a yearly Budget).
 */
export function useBudgets(month: MonthPeriod) {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...budgetsKey(workspace.id), month.year, month.month],
    queryFn: () => api.listBudgets(workspace.id, { month }),
  });
}

/** Refetches every month's list, so the page a save navigates to is current. */
function useRefreshBudgets() {
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return () =>
    queryClient.invalidateQueries({ queryKey: budgetsKey(workspace.id), refetchType: 'all' });
}

/** Owner or Admin only. */
export function useCreateBudget() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshBudgets();
  return useMutation({
    mutationFn: (input: CreateBudgetInput) => api.createBudget(workspace.id, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only. */
export function useUpdateBudget(budgetId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshBudgets();
  return useMutation({
    mutationFn: (input: UpdateBudgetInput) => api.updateBudget(workspace.id, budgetId, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only. */
export function useDeleteBudget(budgetId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshBudgets();
  return useMutation({
    mutationFn: () => api.deleteBudget(workspace.id, budgetId),
    onSuccess: refresh,
  });
}
