import { categoryTree, hasRole } from '@daric/core';
import type { Category, CategoryKind } from '@daric/core';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useId } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSignedIn } from '../auth/session';
import { CategoryBadge } from '../categories/CategoryBadge';
import {
  KIND_ORDER,
  kindParam,
  swapWithNeighbour,
  useCategories,
  useReorderCategories,
} from '../categories/categories';
import { CATEGORY_KIND_LABELS } from '../categories/labels';
import { useI18n } from '../i18n/locale';
import { ChoiceGroup } from '../ui/ChoiceGroup';

const moveButtonClass =
  'rounded-md p-1 text-foreground-muted hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30';

function CategoryRow({
  category,
  canManage,
  onMove,
  first,
  last,
  disabled,
}: {
  category: Category;
  canManage: boolean;
  onMove: (direction: -1 | 1) => void;
  first: boolean;
  last: boolean;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 py-2">
      <CategoryBadge icon={category.icon} color={category.color} />
      <div className="me-auto flex flex-col">
        {canManage ? (
          <Link
            to={`/categories/${category.id}`}
            aria-label={t('categories.edit', { name: category.name })}
            className="font-medium underline-offset-4 hover:underline"
          >
            {category.name}
          </Link>
        ) : (
          <span className="font-medium">{category.name}</span>
        )}
        {category.archived && (
          <span className="text-sm text-foreground-muted">{t('categories.archived')}</span>
        )}
      </div>
      {canManage && (
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={t('categories.moveUp', { name: category.name })}
            disabled={first || disabled}
            onClick={() => onMove(-1)}
            className={moveButtonClass}
          >
            <ChevronUp aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label={t('categories.moveDown', { name: category.name })}
            disabled={last || disabled}
            onClick={() => onMove(1)}
            className={moveButtonClass}
          >
            <ChevronDown aria-hidden="true" className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function CategoriesPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const [params, setParams] = useSearchParams();
  const kind = kindParam(params);
  const includeArchived = params.get('archived') === '1';
  const categories = useCategories();
  const reorder = useReorderCategories();
  const canManage = hasRole(workspace.role, 'ADMIN');
  const toggleId = useId();
  const listLabelId = useId();

  function setParam(name: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  }

  const all = categories.data ?? [];
  const visible = all.filter((c) => c.kind === kind && (includeArchived || !c.archived));
  const tree = categoryTree(visible);

  function move(category: Category, direction: -1 | 1) {
    const ids = swapWithNeighbour(all, visible, category, direction);
    if (ids) reorder.mutate({ ids });
  }

  const row = (category: Category, index: number, siblings: readonly Category[]) => (
    <CategoryRow
      category={category}
      canManage={canManage}
      onMove={(direction) => move(category, direction)}
      first={index === 0}
      last={index === siblings.length - 1}
      disabled={reorder.isPending}
    />
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 id={listLabelId} className="me-auto text-2xl font-bold">
          {t('categories.title')}
        </h1>
        {canManage && (
          <Link
            to={`/categories/new?kind=${kind}`}
            className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary"
          >
            {t('categories.new')}
          </Link>
        )}
      </div>
      {!canManage && <p className="text-sm text-foreground-muted">{t('categories.readOnly')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChoiceGroup<CategoryKind>
          legend={t('categories.kind')}
          hideLegend
          choices={KIND_ORDER.map((value) => ({ value, label: t(CATEGORY_KIND_LABELS[value]) }))}
          value={kind}
          onChange={(value) => setParam('kind', value === 'EXPENSE' ? null : value)}
        />
        <div className="flex items-center gap-2 text-sm">
          <input
            id={toggleId}
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setParam('archived', e.target.checked ? '1' : null)}
          />
          <label htmlFor={toggleId}>{t('categories.showArchived')}</label>
        </div>
      </div>
      {reorder.isError && (
        <p role="alert" className="text-danger">
          {t('categories.reorderFailed')}
        </p>
      )}
      {categories.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : categories.isError ? (
        <p role="alert" className="text-danger">
          {t('categories.loadFailed')}
        </p>
      ) : tree.length === 0 ? (
        <p className="text-foreground-muted">{t('categories.empty')}</p>
      ) : (
        <ul
          aria-labelledby={listLabelId}
          className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface px-4"
        >
          {tree.map(({ children, ...top }, index) => (
            <li key={top.id} className="py-1">
              {row(top, index, tree)}
              {children.length > 0 && (
                <ul
                  aria-label={top.name}
                  className="ms-6 flex flex-col border-s-2 border-border ps-3"
                >
                  {children.map((child, childIndex) => (
                    <li key={child.id}>{row(child, childIndex, children)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
