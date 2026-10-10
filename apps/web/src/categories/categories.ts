import type {
  Category,
  CategoryKind,
  CreateCategoryInput,
  ReorderCategoriesInput,
  UpdateCategoryInput,
} from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';

/** Expense first: it is what people look for most. */
export const KIND_ORDER: readonly CategoryKind[] = ['EXPENSE', 'INCOME'];

/** `?kind=` as a Category kind; Expense unless Income is asked for. */
export function kindParam(params: URLSearchParams): CategoryKind {
  return params.get('kind') === 'INCOME' ? 'INCOME' : 'EXPENSE';
}

const categoriesKey = (workspaceId: string) => ['categories', workspaceId] as const;

/**
 * The Workspace's Categories, archived ones included (reordering needs every
 * sibling), in the API's order: each kind's top level, children after their parent.
 */
export function useCategories() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: categoriesKey(workspace.id),
    queryFn: () => api.listCategories(workspace.id, { includeArchived: true }),
  });
}

/** Refetches even when no screen shows the list, so the page a save navigates to is current. */
function useRefreshCategories() {
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return () =>
    queryClient.invalidateQueries({ queryKey: categoriesKey(workspace.id), refetchType: 'all' });
}

/** Owner or Admin only. */
export function useCreateCategory() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshCategories();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => api.createCategory(workspace.id, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only; also moves, archives and unarchives. */
export function useUpdateCategory(categoryId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshCategories();
  return useMutation({
    mutationFn: (input: UpdateCategoryInput) => api.updateCategory(workspace.id, categoryId, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only. */
export function useReorderCategories() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshCategories();
  return useMutation({
    mutationFn: (input: ReorderCategoriesInput) => api.reorderCategories(workspace.id, input),
    onSuccess: refresh,
  });
}

/**
 * The ids of `category`'s siblings (archived ones included) after swapping it
 * with its nearest `visible` sibling in `direction`, or null at the edge.
 */
export function swapWithNeighbour(
  all: readonly Category[],
  visible: readonly Category[],
  category: Category,
  direction: -1 | 1,
): string[] | null {
  const isSibling = (c: Category) => c.kind === category.kind && c.parentId === category.parentId;
  const shown = visible.filter(isSibling);
  const neighbour = shown[shown.findIndex((c) => c.id === category.id) + direction];
  if (!neighbour) return null;
  return all
    .filter(isSibling)
    .map((c) => c.id)
    .map((id) => (id === category.id ? neighbour.id : id === neighbour.id ? category.id : id));
}
