import { hasRole } from '@daric/core';
import { useLocalSearchParams } from 'expo-router';
import { useSignedIn } from '../../../auth/session';
import { CategoryForm } from '../../../categories/CategoryForm';
import { useI18n } from '../../../i18n/locale';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: a new Category, of the kind the list showed (`?kind=INCOME`). */
export default function NewCategoryScreen() {
  const { t } = useI18n();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { workspace } = useSignedIn();
  return (
    <>
      <ScreenHeader title={t('categories.form.newTitle')} />
      {hasRole(workspace.role, 'ADMIN') ? (
        <CategoryForm kind={kind === 'INCOME' ? 'INCOME' : 'EXPENSE'} />
      ) : (
        <Status alert message={t('categories.readOnly')} />
      )}
    </>
  );
}
