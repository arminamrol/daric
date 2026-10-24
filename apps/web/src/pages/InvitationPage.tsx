import { ApiError } from '@daric/api-client';
import type { InvitationPreview, InvitationRefusal } from '@daric/core';
import { isolate, type PlainMessageKey } from '@daric/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/api';
import { CalendarClock, Mail, ShieldCheck } from 'lucide-react';
import { AuthOutcome, AuthPage } from '../auth/AuthPage';
import { currentWorkspace, ME_QUERY_KEY, useMe } from '../auth/session';
import { useLinkToken } from '../auth/linkToken';
import { VerifyEmailNotice } from '../auth/VerifyEmailNotice';
import { useI18n } from '../i18n/locale';
import { pendingInvitation } from '../members/pendingInvitation';
import { useFormatters } from '../settings/settings';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/ErrorState';
import { FormMessage } from '../ui/Field';
import { Loading, Skeleton } from '../ui/Skeleton';

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
        <AuthOutcome tone="done">
          <p>{t('invitation.joined', { workspace: isolate(joined) })}</p>
        </AuthOutcome>
        <Button asChild className="w-full">
          <Link to="/">{t('invitation.open')}</Link>
        </Button>
      </>
    );
  }

  const notVerified = accept.isError && failure(accept.error) === 'invitation.notVerified';
  return (
    <>
      <p className="text-lg">
        {preview.invitedByEmail
          ? t('invitation.offer', { inviter: isolate(preview.invitedByEmail), workspace, role })
          : t('invitation.offerAnonymous', { workspace, role })}
      </p>
      <ul className="flex flex-col gap-2 text-sm text-foreground-muted">
        {preview.email && (
          <li className="flex items-start gap-2">
            <Mail aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('invitation.forEmail', { email: isolate(preview.email) })}
          </li>
        )}
        <li className="flex items-start gap-2">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('invitation.until', {
            date: isolate(format.date(new Date(preview.expiresAt), { style: 'long' })),
          })}
        </li>
      </ul>
      <p className="flex items-start gap-3 rounded-md bg-surface-muted px-4 py-3 text-sm">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-info" />
        {t('invitation.consent')}
      </p>
      {accept.isError && <FormMessage tone="alert">{t(failure(accept.error))}</FormMessage>}
      {notVerified && <VerifyEmailNotice />}
      <Button disabled={accept.isPending} onClick={() => accept.mutate()} className="w-full">
        {t('invitation.accept')}
      </Button>
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

  if (preview.isPending) {
    return (
      <Loading>
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-16 w-full" />
      </Loading>
    );
  }
  if (preview.isError) {
    const reason = failure(preview.error);
    // Only a request that went wrong on the way is worth sending again; a refused link stays so.
    return reason === 'invitation.failed' ? (
      <ErrorState title={t(reason)} onRetry={() => void preview.refetch()} />
    ) : (
      <FormMessage tone="alert">{t(reason)}</FormMessage>
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
    <AuthPage title={t('invitation.title')}>
      {me.isPending ? (
        <Loading>
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-2/3" />
        </Loading>
      ) : me.data ? (
        <SignedInInvitation token={token} />
      ) : (
        <>
          <p>{t('invitation.signIn')}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="flex-1">
              <Link to="/login">{t('auth.login.title')}</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link to="/signup">{t('auth.signup.title')}</Link>
            </Button>
          </div>
        </>
      )}
    </AuthPage>
  );
}
