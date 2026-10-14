import { useId, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import { currentWorkspace, useMe } from '../auth/session';
import { useI18n } from '../i18n/locale';

/** Chooses which Workspace the app shows; only there for a User in more than one. */
export function WorkspaceSwitcher() {
  const { t } = useI18n();
  const id = useId();
  const navigate = useNavigate();
  const workspaces = useMe().data?.workspaces ?? [];
  const chosen = useSyncExternalStore(currentWorkspace.subscribe, currentWorkspace.get);
  if (workspaces.length < 2) return null;
  const value = workspaces.some((w) => w.id === chosen) ? chosen : workspaces[0]?.id;

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="text-foreground-muted">
        {t('workspace.switch')}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => {
          currentWorkspace.set(e.target.value);
          // Pages may show things of the previous Workspace, so start from home.
          void navigate('/');
        }}
        className="rounded-md border border-border bg-surface px-2 py-1"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {`${w.name} (${t(`roles.${w.role}`)})`}
          </option>
        ))}
      </select>
    </div>
  );
}
