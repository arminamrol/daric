import { hasRole } from '@daric/core';
import { Link, Navigate, useParams } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { LabelForm } from '../labels/LabelForm';
import { useLabels } from '../labels/labels';

/** `/labels/new` and `/labels/:labelId`: Owner and Admin only. */
export function LabelFormPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const { labelId } = useParams();
  const labels = useLabels();

  if (!hasRole(workspace.role, 'ADMIN')) return <Navigate to="/labels" replace />;
  if (!labelId) return <LabelForm />;
  if (labels.isPending) {
    return (
      <p role="status" className="text-center text-foreground-muted">
        {t('session.loading')}
      </p>
    );
  }
  const label = labels.data?.find((l) => l.id === labelId);
  if (!label) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p role="alert">{labels.isError ? t('labels.loadFailed') : t('labels.notFound')}</p>
        <Link to="/labels" className="font-medium text-accent underline underline-offset-4">
          {t('labels.back')}
        </Link>
      </div>
    );
  }
  // Keyed so a different Label starts from its own values.
  return <LabelForm key={label.id} label={label} />;
}
