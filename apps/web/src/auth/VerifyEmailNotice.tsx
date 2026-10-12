import { ApiError } from '@daric/api-client';
import { useMutation } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useI18n } from '../i18n/locale';
import { useSignedIn } from './session';

/** Reminds a User who has not followed their verification link yet, and mails it again. */
export function VerifyEmailNotice() {
  const { t } = useI18n();
  const api = useApi();
  const { me } = useSignedIn();
  const resend = useMutation({ mutationFn: () => api.resendVerification() });
  if (me.user.emailVerified) return null;

  return (
    <aside className="mx-auto flex max-w-md flex-col gap-2 rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm">
      <p>{t('auth.verify.notice')}</p>
      {resend.isSuccess ? (
        <p role="status">{t('auth.verify.resent')}</p>
      ) : (
        <button
          type="button"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
          className="self-start font-medium text-accent underline underline-offset-4 disabled:opacity-60"
        >
          {t('auth.verify.resend')}
        </button>
      )}
      {resend.isError && (
        <p role="alert" className="text-danger">
          {t(
            resend.error instanceof ApiError && resend.error.status === 429
              ? 'auth.error.tooManyAttempts'
              : 'auth.error.unexpected',
          )}
        </p>
      )}
    </aside>
  );
}
