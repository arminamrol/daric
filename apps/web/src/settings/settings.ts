import { displayFormatters } from '@daric/core';
import type {
  DisplayFormatters,
  Me,
  UpdateUserPreferencesInput,
  UpdateWorkspaceInput,
} from '@daric/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from '../api/api';
import { ME_QUERY_KEY, useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';

/**
 * Formatters for every amount and date on screen: the Workspace decides the
 * calendar of Periods, the timezone and Rial/Toman; the User decides the
 * display calendar and digits (ADR-0002).
 */
export function useFormatters(): DisplayFormatters {
  const { locale } = useI18n();
  const { me, workspace } = useSignedIn();
  const { preferences } = me;
  return useMemo(
    () => displayFormatters({ locale, workspace, preferences }),
    [locale, workspace, preferences],
  );
}

const PREFERENCES_MUTATION_KEY = ['preferences'] as const;

/** Saves the User's preferences, showing them at once and undoing them if saving fails. */
export function useUpdatePreferences() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: PREFERENCES_MUTATION_KEY,
    mutationFn: (input: UpdateUserPreferencesInput) => api.updatePreferences(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ME_QUERY_KEY });
      queryClient.setQueryData<Me | null>(
        ME_QUERY_KEY,
        (me) => me && { ...me, preferences: { ...me.preferences, ...input } },
      );
    },
    // Another change may be showing optimistically too; ask the server what was saved.
    onError: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
    onSuccess: (preferences) => {
      // A later change still in flight already shows its own value; let it land first.
      if (queryClient.isMutating({ mutationKey: PREFERENCES_MUTATION_KEY }) > 1) return;
      queryClient.setQueryData<Me | null>(ME_QUERY_KEY, (me) => me && { ...me, preferences });
    },
  });
}

/** Saves Workspace settings (Owner or Admin) and shows the saved Workspace everywhere. */
export function useUpdateWorkspace(workspaceId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorkspaceInput) => api.updateWorkspace(workspaceId, input),
    onSuccess: (saved) => {
      queryClient.setQueryData<Me | null>(
        ME_QUERY_KEY,
        (me) =>
          me && {
            ...me,
            workspaces: me.workspaces.map((w) => (w.id === saved.id ? saved : w)),
          },
      );
    },
  });
}
