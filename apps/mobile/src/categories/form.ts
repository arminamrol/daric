import type { Category, CategoryColor, CategoryIcon, CategoryKind } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';

export interface CategoryDraft {
  /** Fixed once the Category is made. */
  kind: CategoryKind;
  parentId: string | null;
  name: string;
  icon: CategoryIcon;
  color: CategoryColor;
}

/** The Category a draft describes, or what is wrong with its name. */
export function readCategoryDraft(
  draft: CategoryDraft,
): { ok: true; fields: CategoryDraft } | { ok: false; errors: { name?: PlainMessageKey } } {
  const name = draft.name.trim();
  if (name === '') return { ok: false, errors: { name: 'categories.error.nameRequired' } };
  return { ok: true, fields: { ...draft, name } };
}

/**
 * The parents `category` (or a new Category) of `kind` may have: active
 * top-level Categories of the kind other than itself, plus the archived one
 * it already has. A Category with children has none: it stays top-level.
 */
export function parentChoices(
  all: readonly Category[],
  kind: CategoryKind,
  category: Category | undefined,
): Category[] {
  if (category && all.some((c) => c.parentId === category.id)) return [];
  return all.filter(
    (c) =>
      c.kind === kind &&
      c.parentId === null &&
      c.id !== category?.id &&
      (!c.archived || c.id === category?.parentId),
  );
}

/**
 * Why the API would refuse archiving `category` (it has active children) or
 * bringing it back (its parent is archived), if it would; said before asking.
 */
export function archiveProblem(
  category: Category,
  all: readonly Category[],
): PlainMessageKey | undefined {
  if (!category.archived) {
    return all.some((c) => c.parentId === category.id && !c.archived)
      ? 'categories.error.archiveChildrenFirst'
      : undefined;
  }
  return all.some((c) => c.id === category.parentId && c.archived)
    ? 'categories.error.parentArchived'
    : undefined;
}
