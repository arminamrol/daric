import { withWaitingCategories } from '@daric/api-client';
import { categoryTree } from '@daric/core';
import type { Category, CategoryKind } from '@daric/core';
import { isolate } from '@daric/i18n';
import type { Translate } from '@daric/i18n';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { categoriesKey } from '../data/keys';
import { useWaitingWrites } from '../offline/offline';

/** Expense first: it is what people look for most. */
export const KIND_ORDER: readonly CategoryKind[] = ['EXPENSE', 'INCOME'];

/**
 * The Workspace's Categories, archived ones included (old Transactions name
 * them, and reordering needs every sibling), in the API's order: each kind's
 * top level, children after their parent; with the changes still waiting to
 * be sent shown on top and their states.
 */
export function useCategories() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const query = useQuery({
    queryKey: categoriesKey(workspace.id),
    queryFn: () => api.listCategories(workspace.id, { includeArchived: true }),
  });
  const waiting = useWaitingWrites(workspace.id);
  const shown = useMemo(
    () => query.data && withWaitingCategories(query.data, waiting),
    [query.data, waiting],
  );
  return { ...query, data: shown?.items, states: shown?.states };
}

/**
 * `categories` as choices, each parent followed by its children, which carry
 * their parent's name. Children whose parent is left out are left out too.
 */
export function categoryChoices(categories: readonly Category[], t: Translate) {
  return categoryTree(categories).flatMap((top) => [
    { id: top.id, label: top.name },
    ...top.children.map((child) => ({
      id: child.id,
      label: t('transactions.categoryPath', {
        parent: isolate(top.name),
        child: isolate(child.name),
      }),
    })),
  ]);
}
