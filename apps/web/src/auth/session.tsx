import { ApiError } from '@daric/api-client';
import type { Me, MyWorkspace } from '@daric/core';
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useApi } from '../api/api';
import { useI18n } from '../i18n/locale';
import { storedFlag } from '../lib/storedFlag';
import { pendingInvitation } from '../members/pendingInvitation';
import { Onboarding } from '../onboarding/Onboarding';
import { hasSignedIn } from './signedOut';
import { SuspendedWorkspace } from './SuspendedWorkspace';

export const ME_QUERY_KEY = ['me'] as const;

/**
 * Set when a logout could not reach the API: its session cookies are still
 * valid. A login replaces them, so it clears this too.
 */
export const logoutPending = storedFlag('daric.logoutPending');

/** The signed-in User and their Workspaces, or null when nobody is signed in. */
export function useMe() {
  const api = useApi();
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<Me | null> => {
      // A logout made offline is finished first; until then nobody is signed in.
      if (logoutPending.get()) {
        try {
          await api.logout();
          logoutPending.set(false);
        } catch {
          // Still offline: try again next time.
        }
        return null;
      }
      try {
        const me = await api.me();
        // Signed in before this browser remembered it; from now on a 401 is worth a refresh.
        hasSignedIn.set(true);
        return me;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}

const CURRENT_WORKSPACE_KEY = 'daric.workspace';
const workspaceListeners = new Set<() => void>();
/** Kept here when localStorage is unavailable, so a choice holds until reload. */
let unstoredWorkspaceId: string | null = null;

/**
 * Which of the User's Workspaces this browser shows, remembered in
 * localStorage. An id the User is no longer a Member of falls back to the first.
 */
export const currentWorkspace = {
  get(): string | null {
    try {
      return localStorage.getItem(CURRENT_WORKSPACE_KEY);
    } catch {
      return unstoredWorkspaceId;
    }
  },
  set(workspaceId: string | null) {
    try {
      if (workspaceId) localStorage.setItem(CURRENT_WORKSPACE_KEY, workspaceId);
      else localStorage.removeItem(CURRENT_WORKSPACE_KEY);
    } catch {
      unstoredWorkspaceId = workspaceId;
    }
    for (const listener of workspaceListeners) listener();
  },
  subscribe(listener: () => void) {
    workspaceListeners.add(listener);
    return () => void workspaceListeners.delete(listener);
  },
};

/**
 * The signed-in User and the Workspace they are looking at. Only for pages
 * under `RequireSession`, which renders them once `useMe` has a User.
 */
export function useSignedIn(): { me: Me; workspace: MyWorkspace } {
  const { data: me } = useMe();
  const workspace = useChosenWorkspace(me);
  if (!me || !workspace) throw new Error('useSignedIn must be used under <RequireSession>');
  return { me, workspace };
}

function useChosenWorkspace(me: Me | null | undefined): MyWorkspace | undefined {
  const chosen = useSyncExternalStore(currentWorkspace.subscribe, currentWorkspace.get);
  // Every User has at least their Personal Workspace, listed first.
  return me?.workspaces.find((w) => w.id === chosen) ?? me?.workspaces[0];
}

/**
 * Pages that are the User's own, not the Workspace's: still open while their
 * access to the Workspace they are looking at is suspended.
 */
const OWN_PAGES = ['/settings/subscription', '/settings/consents', '/settings/delete-account'];

function Loading() {
  const { t } = useI18n();
  return (
    <p role="status" className="text-center text-foreground-muted">
      {t('session.loading')}
    </p>
  );
}

/**
 * Layout route for pages that need a signed-in User; everyone else goes to
 * login, and a new User sets Daric up first.
 */
export function RequireSession() {
  const { t } = useI18n();
  const me = useMe();
  const workspace = useChosenWorkspace(me.data);
  const location = useLocation();
  if (me.isPending) return <Loading />;
  // Who was signed in last time is enough offline: a failed refetch keeps it.
  if (me.isError && me.data === undefined) {
    return (
      <p role="alert" className="text-center text-danger">
        {t('session.error')}
      </p>
    );
  }
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!me.data.user.onboarded) return <Onboarding />;
  if (workspace?.suspended && !OWN_PAGES.some((page) => location.pathname.startsWith(page))) {
    return <SuspendedWorkspace workspace={workspace} />;
  }
  return <Outlet />;
}

/**
 * Where a User goes once signed in: back to an Invitation opened while signed
 * out, else to the page that sent them to log in, else home.
 */
export function useAfterSignIn(): () => string {
  const { state } = useLocation();
  const from = (state as { from?: unknown } | null)?.from;
  return () =>
    pendingInvitation.get()
      ? '/invitation'
      : typeof from === 'string' && from.startsWith('/')
        ? from
        : '/';
}

/** Layout route for login and sign-up; a signed-in User goes on (`useAfterSignIn`) instead. */
export function GuestOnly() {
  const me = useMe();
  const afterSignIn = useAfterSignIn();
  if (me.isPending) return <Loading />;
  if (me.data) return <Navigate to={afterSignIn()} replace />;
  return <Outlet />;
}
