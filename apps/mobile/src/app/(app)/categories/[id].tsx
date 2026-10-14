import { hasRole } from '@daric/core';
import { useLocalSearchParams } from 'expo-router';
import { useSignedIn } from '../../../auth/session';
import { CategoryForm } from '../../../categories/CategoryForm';
import { useCategories } from '../../../categories/categories';
import { useI18n } from '../../../i18n/locale';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: edits, moves or archives a Category. */
export default function EditCategoryScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workspace } = useSignedIn();
  const categories = useCategories();
  const category = categories.data?.find((c) => c.id === id);
  return (
    <>
      <ScreenHeader title={t('categories.form.editTitle')} />
      {!hasRole(workspace.role, 'ADMIN') ? (
        <Status alert message={t('categories.readOnly')} />
      ) : categories.isPending ? (
        <Status message={t('session.loading')} />
      ) : category ? (
        <CategoryForm key={category.id} category={category} />
      ) : (
        <Status alert message={t('categories.notFound')} />
      )}
    </>
  );
}
