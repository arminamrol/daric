import { hasRole } from '@daric/core';
import { useLocalSearchParams } from 'expo-router';
import { useSignedIn } from '../../../auth/session';
import { useI18n } from '../../../i18n/locale';
import { LabelForm } from '../../../labels/LabelForm';
import { useLabels } from '../../../labels/labels';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: renames, flags or archives a Label. */
export default function EditLabelScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workspace } = useSignedIn();
  const labels = useLabels();
  const label = labels.data?.find((l) => l.id === id);
  return (
    <>
      <ScreenHeader title={t('labels.form.editTitle')} />
      {!hasRole(workspace.role, 'ADMIN') ? (
        <Status alert message={t('labels.readOnly')} />
      ) : labels.isPending ? (
        <Status message={t('session.loading')} />
      ) : label ? (
        <LabelForm key={label.id} label={label} />
      ) : (
        <Status alert message={t('labels.notFound')} />
      )}
    </>
  );
}
