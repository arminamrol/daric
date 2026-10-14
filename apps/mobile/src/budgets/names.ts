import type { Budget, Category, Label } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useMemo } from 'react';
import { categoryChoices } from '../categories/categories';
import { useI18n } from '../i18n/locale';

/**
 * Names a Budget by its Category (`parent › child` for a child) and, when it
 * is narrowed to one, its Label. Archived ones keep their names.
 */
export function useBudgetNames(
  categories: readonly Category[] | undefined,
  labels: readonly Label[] | undefined,
) {
  const { t } = useI18n();
  return useMemo(() => {
    const categoryNames = new Map(
      categoryChoices(categories ?? [], t).map((choice) => [choice.id, choice.label]),
    );
    const labelNames = new Map((labels ?? []).map((label) => [label.id, label.name]));
    return (budget: Pick<Budget, 'categoryId' | 'labelId'>) => {
      const category = categoryNames.get(budget.categoryId) ?? '';
      const label = budget.labelId === null ? undefined : labelNames.get(budget.labelId);
      return label === undefined
        ? category
        : t('budgets.withLabel', { category: isolate(category), label: isolate(label) });
    };
  }, [categories, labels, t]);
}
