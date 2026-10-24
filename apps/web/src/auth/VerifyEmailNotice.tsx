import { ApiError } from '@daric/api-client';
import { useMutation } from '@tanstack/react-query';
import { MailWarning } from 'lucide-react';
import { useApi } from '../api/api';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { useSignedIn } from './session';

/** Reminds a User who has not followed their verification link yet, and mails it again. */
export function VerifyEmailNotice() {
  const { t } = useI18n();
  const api = useApi();
  const { me } = useSignedIn();
  const resend = useMutation({ mutationFn: () => api.resendVerification() });
  if (me.user.emailVerified) return null;

  return (
    <aside className="flex items-start gap-3 rounded-md border border-border bg-warning-subtle px-4 py-3 text-sm">
      <MailWarning aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="flex min-w-0 flex-col gap-2">
        <p>{t('auth.verify.notice')}</p>
        {resend.isSuccess ? (
          <p role="status">{t('auth.verify.resent')}</p>
        ) : (
          <Button
            variant="link"
            onClick={() => resend.mutate()}
            disabled={resend.isPending}
            className="self-start text-sm"
          >
            {t('auth.verify.resend')}
          </Button>
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
      </div>
    </aside>
  );
}
