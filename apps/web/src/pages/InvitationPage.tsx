import { ApiError } from '@daric/api-client';
import type { InvitationPreview, InvitationRefusal } from '@daric/core';
import { isolate, type PlainMessageKey } from '@daric/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/api';
import { alertClass, cardClass, linkClass } from '../auth/AuthForm';
import { currentWorkspace, ME_QUERY_KEY, useMe } from '../auth/session';
import { useLinkToken } from '../auth/linkToken';
import { VerifyEmailNotice } from '../auth/VerifyEmailNotice';
import { useI18n } from '../i18n/locale';
import { pendingInvitation } from '../members/pendingInvitation';
import { useFormatters } from '../settings/settings';

/** Why accepting failed, as a message the person can act on. */
function failure(error: unknown): PlainMessageKey {
  if (!(error instanceof ApiError)) return 'invitation.failed';
  const reason = (error.body as { reason?: InvitationRefusal } | undefined)?.reason;
  if (error.status === 403 && reason === 'EMAIL_NOT_VERIFIED') return 'invitation.notVerified';
  if (error.status === 403 && reason === 'EMAIL_MISMATCH') return 'invitation.mismatch';
  if (error.status === 409) return 'invitation.alreadyMember';
  if (error.status === 402) return 'invitation.notEntitled';
  if (error.status === 400) return 'invitation.invalid';
  return 'invitation.failed';
}

function Offer({ token, preview }: { token: string; preview: InvitationPreview }) {
  const { t } = useI18n();
  const api = useApi();
  const queryClient = useQueryClient();
  const format = useFormatters();
  const [joined, setJoined] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: () => api.acceptInvitation(token),
    onSuccess: async ({ workspace }) => {
      pendingInvitation.set(null);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      currentWorkspace.set(workspace.id);
      setJoined(workspace.name);
    },
  });
  const workspace = isolate(preview.workspaceName);
  const role = t(`roles.${preview.role}`);

  if (joined !== null) {
    return (
      <>
        <p role="status">{t('invitation.joined', { workspace: isolate(joined) })}</p>
        <Link to="/" className={linkClass}>
          {t('invitation.open')}
        </Link>
      </>
    );
  }

  const notVerified = accept.isError && failure(accept.error) === 'invitation.notVerified';
  return (
    <>
      <p>
        {preview.invitedByEmail
          ? t('invitation.offer', { inviter: isolate(preview.invitedByEmail), workspace, role })
          : t('invitation.offerAnonymous', { workspace, role })}
      </p>
      {preview.email && (
        <p className="text-sm">{t('invitation.forEmail', { email: isolate(preview.email) })}</p>
      )}
      <p className="text-sm text-foreground-muted">
        {t('invitation.until', {
          date: isolate(format.date(new Date(preview.expiresAt), { style: 'long' })),
        })}
      </p>
      <p className="rounded-md bg-surface-muted px-3 py-2 text-sm">{t('invitation.consent')}</p>
      <button
        type="button"
        disabled={accept.isPending}
        onClick={() => accept.mutate()}
        className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60"
      >
        {t('invitation.accept')}
      </button>
      {accept.isError && (
        <p role="alert" className={alertClass}>
          {t(failure(accept.error))}
        </p>
      )}
      {notVerified && <VerifyEmailNotice />}
    </>
  );
}

function SignedInInvitation({ token }: { token: string }) {
  const { t } = useI18n();
  const api = useApi();
  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => {
      if (!token) throw new ApiError(400, { message: 'No token in the link' });
      return api.previewInvitation(token);
    },
    retry: false,
  });

  if (preview.isPending) return <p role="status">{t('session.loading')}</p>;
  if (preview.isError) {
    return (
      <p role="alert" className={alertClass}>
        {t(failure(preview.error))}
      </p>
    );
  }
  return <Offer token={token} preview={preview.data} />;
}

/**
 * Opened from an Invitation link (`?token=`), signed in or not. A visitor who
 * is signed out logs in or signs up first; the token waits in this tab.
 */
export function InvitationPage() {
  const { t } = useI18n();
  const me = useMe();
  const linkToken = useLinkToken();
  const [token] = useState(() => {
    if (linkToken) pendingInvitation.set(linkToken);
    return linkToken || (pendingInvitation.get() ?? '');
  });

  return (
    <section className={cardClass}>
      <h1 className="text-2xl font-bold">{t('invitation.title')}</h1>
      {me.isPending ? (
        <p role="status">{t('session.loading')}</p>
      ) : me.data ? (
        <SignedInInvitation token={token} />
      ) : (
        <>
          <p>{t('invitation.signIn')}</p>
          <div className="flex flex-wrap gap-4">
            <Link to="/login" className={linkClass}>
              {t('auth.login.title')}
            </Link>
            <Link to="/signup" className={linkClass}>
              {t('auth.signup.title')}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
