import { ApiError } from '@daric/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useApi } from '../api/api';
import { alertClass, cardClass, linkClass } from '../auth/AuthForm';
import { ME_QUERY_KEY } from '../auth/session';
import { useI18n } from '../i18n/locale';

/**
 * Opened from the mailed verification link (`?token=`), signed in or not. A
 * query rather than a mutation: the token works once, and a query is sent once
 * per token however often the page renders or mounts.
 */
export function VerifyEmailPage() {
  const { t } = useI18n();
  const api = useApi();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
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
    <section className={cardClass}>
      <h1 className="text-2xl font-bold">{t('auth.verify.title')}</h1>
      {verify.isPending && <p role="status">{t('auth.verify.pending')}</p>}
      {verify.isSuccess && <p role="status">{t('auth.verify.done')}</p>}
      {verify.isError && (
        <p role="alert" className={alertClass}>
          {t(linkInvalid ? 'auth.error.linkInvalid' : 'auth.error.unexpected')}
        </p>
      )}
      <Link to="/" className={linkClass}>
        {t('auth.verify.toHome')}
      </Link>
    </section>
  );
}
