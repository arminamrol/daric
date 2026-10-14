import { withWaitingLabels } from '@daric/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { labelsKey } from '../data/keys';
import { useWaitingWrites } from '../offline/offline';

/**
 * The Workspace's Labels by name, archived ones included (old Transactions
 * name them; filter on screen), with the changes still waiting to be sent
 * shown on top and their states.
 */
export function useLabels() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const query = useQuery({
    queryKey: labelsKey(workspace.id),
    queryFn: () => api.listLabels(workspace.id, { includeArchived: true }),
  });
  const waiting = useWaitingWrites(workspace.id);
  const shown = useMemo(
    () => query.data && withWaitingLabels(query.data, waiting),
    [query.data, waiting],
  );
  return { ...query, data: shown?.items, states: shown?.states };
}
