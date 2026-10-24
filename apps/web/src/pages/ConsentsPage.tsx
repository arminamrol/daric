import type { Consent } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useNavigate } from 'react-router';
import { useI18n } from '../i18n/locale';
import { useConsents, useRevokeConsent } from '../members/members';
import { useFormatters } from '../settings/settings';
import { ConfirmDialog } from '../ui/ConfirmDialog';

function ConsentRow({ consent }: { consent: Consent }) {
  const { t } = useI18n();
  const format = useFormatters();
  const navigate = useNavigate();
  const revoke = useRevokeConsent();
  const date = (iso: string) => isolate(format.date(new Date(iso), { style: 'long' }));
  const workspace = consent.workspace?.name ?? t('consents.goneWorkspace');

  return (
    <li className="flex flex-col gap-1 py-3">
      <p className="font-medium">
        {t(`consents.purpose.${consent.purpose}`, { workspace: isolate(workspace) })}
      </p>
      <p className="text-sm text-foreground-muted">
        {consent.revokedAt
          ? t('consents.revoked', { date: date(consent.revokedAt) })
          : t('consents.granted', { date: date(consent.grantedAt) })}
        {' · '}
        {t('consents.policy', { version: isolate(consent.policyVersion) })}
      </p>
      {!consent.revokedAt && (
        <ConfirmDialog
          label={t('consents.revoke')}
          question={t('consents.revokeConfirm')}
          confirm={t('consents.revokeYes')}
          cancel={t('consents.cancel')}
          pending={revoke.isPending}
          onConfirm={() => revoke.mutate(consent.id, { onSuccess: () => void navigate('/') })}
        />
      )}
      {revoke.isError && (
        <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
          {t('consents.revokeFailed')}
        </p>
      )}
    </li>
  );
}

/** `/settings/consents`: the User's own Consents, across Workspaces, each revocable at once. */
export function ConsentsPage() {
  const { t } = useI18n();
  const consents = useConsents();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('consents.title')}</h1>
      <p className="text-sm text-foreground-muted">{t('consents.hint')}</p>
      {consents.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : consents.isError ? (
        <p role="alert" className="text-danger">
          {t('consents.loadFailed')}
        </p>
      ) : consents.data.length === 0 ? (
        <p className="text-foreground-muted">{t('consents.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface px-4">
          {consents.data.map((consent) => (
            <ConsentRow key={consent.id} consent={consent} />
          ))}
        </ul>
      )}
    </div>
  );
}
