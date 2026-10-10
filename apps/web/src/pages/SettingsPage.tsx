import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { DisplayPreview } from '../settings/DisplayPreview';
import { PreferencesForm } from '../settings/PreferencesForm';
import { WorkspaceSettingsForm } from '../settings/WorkspaceSettingsForm';

export function SettingsPage() {
  const { t } = useI18n();
  const { me, workspace } = useSignedIn();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      <DisplayPreview />
      <PreferencesForm preferences={me.preferences} />
      <WorkspaceSettingsForm workspace={workspace} />
    </div>
  );
}
