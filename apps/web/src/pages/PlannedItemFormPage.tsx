import { hasRole } from '@daric/core';
import { Link, Navigate, useParams } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useCategories } from '../categories/categories';
import { useI18n } from '../i18n/locale';
import { PlannedItemForm } from '../projection/PlannedItemForm';
import { usePlannedItems } from '../projection/planned-items';

/** `/projection/planned/new` and `/projection/planned/:itemId`: Owner and Admin only. */
export function PlannedItemFormPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const { itemId } = useParams();
  const categories = useCategories();
  const items = usePlannedItems();

  if (!hasRole(workspace.role, 'ADMIN')) return <Navigate to="/projection" replace />;
  if (categories.isPending || (itemId && items.isPending)) {
    return (
      <p role="status" className="text-center text-foreground-muted">
        {t('session.loading')}
      </p>
    );
  }
  const item = itemId ? items.data?.find((i) => i.id === itemId) : undefined;
  const failed = categories.isError || (itemId && items.isError);
  if (failed || (itemId && !item)) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p role="alert">{failed ? t('plannedItems.loadFailed') : t('plannedItems.notFound')}</p>
        <Link to="/projection" className="font-medium text-accent underline underline-offset-4">
          {t('plannedItems.back')}
        </Link>
      </div>
    );
  }
  // Keyed so a different item starts from its own values.
  return (
    <PlannedItemForm
      key={item?.id ?? 'new'}
      {...(item && { item })}
      categories={categories.data ?? []}
    />
  );
}
