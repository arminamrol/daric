import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useDiscardChange, useSettleConflict } from '../transactions/transactions';
import { useWaitingChanges } from './offline';

const buttonClass = 'rounded-md border border-border px-3 py-1 text-sm font-medium';

/**
 * What waits to be sent from this device: whether changes are on their way,
 * and the ones that need the user, an edit that ran into a newer copy (keep
 * theirs or mine) or a change the API refused (discard).
 */
export function SyncStatus() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const waiting = useWaitingChanges(workspace.id);
  const settle = useSettleConflict();
  const discard = useDiscardChange();
  const pending = waiting.some((e) => e.status === 'pending');
  const stuck = waiting.filter((e) => e.status !== 'pending');
  if (waiting.length === 0) return null;

  return (
    <div className="mx-auto mb-6 flex max-w-2xl flex-col gap-2">
      {pending && (
        <p role="status" className="text-sm text-foreground-muted">
          {t('sync.pending')}
        </p>
      )}
      {stuck.map((entry) => (
        <div
          key={entry.seq}
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md bg-surface-muted px-4 py-2 text-sm"
        >
          <p className="me-auto">
            {t(entry.status === 'conflict' ? 'sync.conflict' : 'sync.rejected')}
          </p>
          {entry.status === 'conflict' ? (
            <>
              <button
                type="button"
                onClick={() => void settle(entry.entityId, 'theirs')}
                className={buttonClass}
              >
                {t('transactions.edit.keepTheirs')}
              </button>
              <button
                type="button"
                onClick={() => void settle(entry.entityId, 'mine')}
                className={buttonClass}
              >
                {t('transactions.edit.keepMine')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void discard(entry.entityId)}
              className={buttonClass}
            >
              {t('sync.discard')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
