import { hasRole } from '@daric/core';
import { useSignedIn } from '../../../auth/session';
import { useI18n } from '../../../i18n/locale';
import { LabelForm } from '../../../labels/LabelForm';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: a new Label. */
export default function NewLabelScreen() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  return (
    <>
      <ScreenHeader title={t('labels.form.newTitle')} />
      {hasRole(workspace.role, 'ADMIN') ? (
        <LabelForm />
      ) : (
        <Status alert message={t('labels.readOnly')} />
      )}
    </>
  );
}
