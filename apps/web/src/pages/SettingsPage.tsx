import { hasRole } from '@daric/core';
import { Link } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { DisplayPreview } from '../settings/DisplayPreview';
import { ExportData } from '../settings/ExportData';
import { PreferencesForm } from '../settings/PreferencesForm';
import { WorkspaceSettingsForm } from '../settings/WorkspaceSettingsForm';

export function SettingsPage() {
  const { t } = useI18n();
  const { me, workspace } = useSignedIn();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      <Link
        to="/settings/subscription"
        className="w-fit font-medium text-accent underline underline-offset-4"
      >
        {t('subscription.link')}
      </Link>
      <DisplayPreview />
      <PreferencesForm preferences={me.preferences} />
      <WorkspaceSettingsForm workspace={workspace} />
      {hasRole(workspace.role, 'ADMIN') && <ExportData workspaceId={workspace.id} />}
    </div>
  );
}
