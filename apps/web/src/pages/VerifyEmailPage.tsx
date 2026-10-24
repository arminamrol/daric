import { ApiError } from '@daric/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useApi } from '../api/api';
import { AuthOutcome, AuthPage } from '../auth/AuthPage';
import { ME_QUERY_KEY } from '../auth/session';
import { useLinkToken } from '../auth/linkToken';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/ErrorState';
import { FormMessage } from '../ui/Field';

/**
 * Opened from the mailed verification link (`?token=`), signed in or not. A
 * query rather than a mutation: the token works once, and a query is sent once
 * per token however often the page renders or mounts. A link the server refused is not tried
 * again; a request that never reached it can be.
 */
export function VerifyEmailPage() {
  const { t } = useI18n();
  const api = useApi();
  const queryClient = useQueryClient();
  const token = useLinkToken();
  const verify = useQuery({
    queryKey: ['verify-email', token],
    queryFn: async () => {
      if (!token) throw new ApiError(400, { message: 'No token in the link' });
      await api.verifyEmail(token);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      return true;
    },
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const linkInvalid = verify.error instanceof ApiError && verify.error.status === 400;

  return (
    <AuthPage title={t('auth.verify.title')}>
      {verify.isPending && (
        <AuthOutcome tone="pending">
          <p>{t('auth.verify.pending')}</p>
        </AuthOutcome>
      )}
      {verify.isSuccess && (
        <AuthOutcome tone="done">
          <p>{t('auth.verify.done')}</p>
        </AuthOutcome>
      )}
      {verify.isError &&
        (linkInvalid ? (
          <FormMessage tone="alert">{t('auth.error.linkInvalid')}</FormMessage>
        ) : (
          <ErrorState title={t('auth.error.unexpected')} onRetry={() => void verify.refetch()} />
        ))}
      <Button asChild variant={verify.isSuccess ? 'primary' : 'outline'} className="w-full">
        <Link to="/">{t('auth.verify.toHome')}</Link>
      </Button>
    </AuthPage>
  );
}
