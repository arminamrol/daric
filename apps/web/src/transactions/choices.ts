import { categoryTree } from '@daric/core';
import type { Category } from '@daric/core';
import { isolate } from '@daric/i18n';
import type { Translate } from '@daric/i18n';

export interface CategoryChoice {
  readonly id: string;
  readonly label: string;
}

/**
 * `categories` as options, each parent followed by its children, which carry
 * their parent's name. Children whose parent is left out are left out too.
 */
export function categoryChoices(categories: readonly Category[], t: Translate): CategoryChoice[] {
  return categoryTree(categories).flatMap((top) => [
    { id: top.id, label: top.name },
    ...top.children.map((child) => ({
      id: child.id,
      label: t('transactions.categoryPath', {
        parent: isolate(top.name),
        child: isolate(child.name),
      }),
    })),
  ]);
}
