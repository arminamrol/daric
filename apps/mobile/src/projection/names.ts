import { useMemo } from 'react';
import { categoryChoices, useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';

/** `parent › child` names by Category id, archived ones too; none is "uncategorized". */
export function useCategoryNames() {
  const { t } = useI18n();
  const categories = useCategories();
  const names = useMemo(
    () =>
      new Map(categoryChoices(categories.data ?? [], t).map((choice) => [choice.id, choice.label])),
    [categories.data, t],
  );
  return (categoryId: string | null) =>
    categoryId === null ? t('projection.uncategorized') : (names.get(categoryId) ?? '');
}

export type NameOf = ReturnType<typeof useCategoryNames>;
