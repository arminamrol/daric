import { ApiError } from '@daric/api-client';
import type { Me, Workspace } from '@daric/core';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router';
import { useApi } from '../api/api';
import { useI18n } from '../i18n/locale';

export const ME_QUERY_KEY = ['me'] as const;

/** Set when a logout could not reach the API: its session cookies are still valid. */
const LOGOUT_PENDING_KEY = 'daric.logoutPending';

export function markLogoutPending() {
  try {
    localStorage.setItem(LOGOUT_PENDING_KEY, 'yes');
  } catch {
    // Storage blocked: the session lasts until it expires.
  }
}

function logoutPending(): boolean {
  try {
    return localStorage.getItem(LOGOUT_PENDING_KEY) === 'yes';
  } catch {
    return false;
  }
}

/** A login replaces the old session, so a logout still owed is moot. */
export function clearLogoutPending() {
  try {
    localStorage.removeItem(LOGOUT_PENDING_KEY);
  } catch {
    // Storage blocked: nothing was marked.
  }
}

/** The signed-in User and their Workspaces, or null when nobody is signed in. */
export function useMe() {
  const api = useApi();
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<Me | null> => {
      // A logout made offline is finished first; until then nobody is signed in.
      if (logoutPending()) {
        try {
          await api.logout();
          clearLogoutPending();
        } catch {
          // Still offline: try again next time.
        }
        return null;
      }
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

/**
 * The signed-in User and the Workspace they are looking at. Only for pages
 * under `RequireSession`, which renders them once `useMe` has a User.
 */
export function useSignedIn(): { me: Me; workspace: Workspace } {
  const { data: me } = useMe();
  // Every User has at least their Personal Workspace; switching Workspaces comes later.
  const workspace = me?.workspaces[0];
  if (!me || !workspace) throw new Error('useSignedIn must be used under <RequireSession>');
  return { me, workspace };
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
  // Who was signed in last time is enough offline: a failed refetch keeps it.
  if (me.isError && me.data === undefined) {
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
