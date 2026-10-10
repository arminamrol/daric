import { hasRole } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useId } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useLabels } from '../labels/labels';

/** `/labels` (`?archived=1` shows archived ones too): every Member sees them, Owners and Admins change them. */
export function LabelsPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const [params, setParams] = useSearchParams();
  const includeArchived = params.get('archived') === '1';
  const labels = useLabels();
  const canManage = hasRole(workspace.role, 'ADMIN');
  const toggleId = useId();
  const listLabelId = useId();

  function setArchived(show: boolean) {
    const next = new URLSearchParams(params);
    if (show) next.set('archived', '1');
    else next.delete('archived');
    setParams(next, { replace: true });
  }

  const visible = (labels.data ?? []).filter((l) => includeArchived || !l.archived);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 id={listLabelId} className="me-auto text-2xl font-bold">
          {t('labels.title')}
        </h1>
        {canManage && (
          <Link
            to="/labels/new"
            className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary"
          >
            {t('labels.new')}
          </Link>
        )}
      </div>
      {!canManage && <p className="text-sm text-foreground-muted">{t('labels.readOnly')}</p>}
      <div className="flex items-center gap-2 text-sm">
        <input
          id={toggleId}
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        <label htmlFor={toggleId}>{t('labels.showArchived')}</label>
      </div>
      {labels.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : labels.isError ? (
        <p role="alert" className="text-danger">
          {t('labels.loadFailed')}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-foreground-muted">{t('labels.empty')}</p>
      ) : (
        <ul
          aria-labelledby={listLabelId}
          className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface px-4"
        >
          {visible.map((label) => (
            <li key={label.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              {canManage ? (
                <Link
                  to={`/labels/${label.id}`}
                  aria-label={t('labels.edit', { name: isolate(label.name) })}
                  className="me-auto font-medium underline-offset-4 hover:underline"
                >
                  {label.name}
                </Link>
              ) : (
                <span className="me-auto font-medium">{label.name}</span>
              )}
              {label.controllable && (
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-sm">
                  {t('labels.controllable')}
                </span>
              )}
              {label.archived && (
                <span className="text-sm text-foreground-muted">{t('labels.archived')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
