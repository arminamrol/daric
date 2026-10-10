import { ApiError } from '@daric/api-client';
import type { Me } from '@daric/core';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router';
import { useApi } from '../api/api';
import { useI18n } from '../i18n/locale';

export const ME_QUERY_KEY = ['me'] as const;

/** The signed-in User and their Workspaces, or null when nobody is signed in. */
export function useMe() {
  const api = useApi();
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await api.me();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}

function Loading() {
  const { t } = useI18n();
  return (
    <p role="status" className="text-center text-foreground-muted">
      {t('session.loading')}
    </p>
  );
}

/** Layout route for pages that need a signed-in User; everyone else goes to login. */
export function RequireSession() {
  const { t } = useI18n();
  const me = useMe();
  if (me.isPending) return <Loading />;
  if (me.isError) {
    return (
      <p role="alert" className="text-center text-danger">
        {t('session.error')}
      </p>
    );
  }
  if (!me.data) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Layout route for login and sign-up; a signed-in User goes home instead. */
export function GuestOnly() {
  const me = useMe();
  if (me.isPending) return <Loading />;
  if (me.data) return <Navigate to="/" replace />;
  return <Outlet />;
}
