import { hasRole } from '@daric/core';
import { useLocalSearchParams } from 'expo-router';
import { useSignedIn } from '../../../auth/session';
import { useI18n } from '../../../i18n/locale';
import { PlannedItemForm } from '../../../projection/PlannedItemForm';
import { usePlannedItems } from '../../../projection/projection';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: changes or deletes a Planned Item. */
export default function EditPlannedItemScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workspace } = useSignedIn();
  const items = usePlannedItems();
  const item = items.data?.find((i) => i.id === id);
  return (
    <>
      <ScreenHeader title={t('plannedItems.form.editTitle')} />
      {!hasRole(workspace.role, 'ADMIN') ? (
        <Status alert message={t('plannedItems.readOnly')} />
      ) : items.isPending ? (
        <Status message={t('session.loading')} />
      ) : item ? (
        <PlannedItemForm key={item.id} item={item} />
      ) : (
        <Status
          alert
          message={items.data ? t('plannedItems.notFound') : t('plannedItems.loadFailed')}
        />
      )}
    </>
  );
}
