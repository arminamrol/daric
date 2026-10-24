import { hasRole } from '@daric/core';
import { useSignedIn } from '../auth/session';
import { useDueOccurrences } from '../recurring/recurring';
import { moreSections } from './sections';

/** What the signed-in navigation offers: the More sections, Due Occurrences waiting, recording. */
export function useNavigation() {
  const { me, workspace } = useSignedIn();
  // Asked on every page: this also records those of auto-posting rules as soon as the app opens.
  const dueCount = useDueOccurrences().data?.occurrences.length ?? 0;
  return {
    more: moreSections({ operator: me.user.operator ?? false }),
    dueCount,
    canRecord: hasRole(workspace.role, 'MEMBER'),
  };
}
