import { hasRole } from '@daric/core';
import { useSignedIn } from '../../../auth/session';
import { useI18n } from '../../../i18n/locale';
import { PlannedItemForm } from '../../../projection/PlannedItemForm';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: a new Planned Item. */
export default function NewPlannedItemScreen() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  return (
    <>
      <ScreenHeader title={t('plannedItems.form.newTitle')} />
      {hasRole(workspace.role, 'ADMIN') ? (
        <PlannedItemForm />
      ) : (
        <Status alert message={t('plannedItems.readOnly')} />
      )}
    </>
  );
}
