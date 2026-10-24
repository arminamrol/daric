import { useId, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import { currentWorkspace, useMe } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { cn } from '../ui/cn';

/**
 * Chooses which Workspace the app shows; only there for a User in more than one.
 * `stacked` puts the label above the choice, for the sidebar; `hideLabel` keeps it for screen
 * readers only, for a phone's top bar.
 */
export function WorkspaceSwitcher({
  stacked = false,
  hideLabel = false,
}: {
  stacked?: boolean;
  hideLabel?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const navigate = useNavigate();
  const workspaces = useMe().data?.workspaces ?? [];
  const chosen = useSyncExternalStore(currentWorkspace.subscribe, currentWorkspace.get);
  if (workspaces.length < 2) return null;
  const value = workspaces.some((w) => w.id === chosen) ? chosen : workspaces[0]?.id;

  return (
    <div className={cn('flex min-w-0 gap-2 text-sm', stacked ? 'flex-col' : 'items-center')}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-foreground-muted'}>
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
        className="min-h-9 min-w-0 truncate rounded-md border border-border-strong bg-surface px-2 py-1 text-foreground"
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
