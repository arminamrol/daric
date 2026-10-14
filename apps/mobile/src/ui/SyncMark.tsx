import type { SyncState } from '@daric/api-client';
import type { PlainMessageKey } from '@daric/i18n';
import { useI18n } from '../i18n/locale';
import { Text } from './Text';

export const SYNC_LABELS = {
  pending: 'transactions.list.pending',
  conflict: 'transactions.list.conflict',
  rejected: 'transactions.list.rejected',
} as const satisfies Record<SyncState, PlainMessageKey>;

/** Says that a change is not sent yet, or waits for the user. */
export function SyncMark({ state }: { state: SyncState | undefined }) {
  const { t } = useI18n();
  if (!state) return null;
  return (
    <Text size="xs" tone={state === 'pending' ? 'foregroundMuted' : 'danger'}>
      {t(SYNC_LABELS[state])}
    </Text>
  );
}
