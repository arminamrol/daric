import { hasRole } from '@daric/core';
import { Link, Navigate, useParams } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { RateForm } from '../rates/RateForm';
import { useExchangeRates } from '../rates/rates';

/** `/rates/new` and `/rates/:rateId`: Owner and Admin only. */
export function RateFormPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const { rateId } = useParams();
  const rates = useExchangeRates();

  if (!hasRole(workspace.role, 'ADMIN')) return <Navigate to="/rates" replace />;
  if (rateId && rates.isPending) {
    return (
      <p role="status" className="text-center text-foreground-muted">
        {t('session.loading')}
      </p>
    );
  }
  const rate = rateId ? rates.data?.find((r) => r.id === rateId) : undefined;
  const failed = rateId && rates.isError;
  if (failed || (rateId && !rate)) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p role="alert">{failed ? t('rates.loadFailed') : t('rates.notFound')}</p>
        <Link to="/rates" className="font-medium text-accent underline underline-offset-4">
          {t('rates.back')}
        </Link>
      </div>
    );
  }
  // Keyed so a different rate starts from its own values.
  return <RateForm key={rate?.id ?? 'new'} {...(rate && { rate })} />;
}
