import { hasRole } from '@daric/core';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { useSignedIn } from '../auth/session';
import { CategoryForm } from '../categories/CategoryForm';
import { kindParam, useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';

/** `/categories/new?kind=` and `/categories/:categoryId`: Owner and Admin only. */
export function CategoryFormPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const { categoryId } = useParams();
  const [params] = useSearchParams();
  const categories = useCategories();

  if (!hasRole(workspace.role, 'ADMIN')) return <Navigate to="/categories" replace />;
  if (!categoryId) return <CategoryForm kind={kindParam(params)} />;
  if (categories.isPending) {
    return (
      <p role="status" className="text-center text-foreground-muted">
        {t('session.loading')}
      </p>
    );
  }
  const category = categories.data?.find((c) => c.id === categoryId);
  if (!category) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p role="alert">
          {categories.isError ? t('categories.loadFailed') : t('categories.notFound')}
        </p>
        <Link to="/categories" className="font-medium text-accent underline underline-offset-4">
          {t('categories.back')}
        </Link>
      </div>
    );
  }
  // Keyed so a different Category starts from its own values.
  return <CategoryForm key={category.id} category={category} />;
}
