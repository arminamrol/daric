import { ApiError, type ApiClient } from '@daric/api-client';
import { hasRole } from '@daric/core';
import type { Me, Session, UserPreferences, Workspace, WorkspaceRole } from '@daric/core';

export const testPassword = 'correct horse battery';

interface FakeUser {
  id: string;
  email: string;
  password: string;
  preferences: UserPreferences;
}

/**
 * An in-memory stand-in for the API, as the browser sees it: the session is
 * the server's business, so the fake keeps it and answers `me()` from it.
 */
export function fakeApi({
  signedInAs,
  role = 'OWNER',
}: { signedInAs?: string; role?: WorkspaceRole } = {}) {
  const users = new Map<string, FakeUser>();
  let current: FakeUser | undefined;
  let nextId = 1;
  // Every User shares this one Workspace, with the same Role.
  let workspace: Workspace = {
    id: '01900000-0000-7000-9000-000000000001',
    type: 'PERSONAL',
    name: 'Personal',
    baseCurrency: 'IRR',
    calendar: 'jalali',
    timezone: 'Asia/Tehran',
    moneyDisplay: 'rial',
    role,
  };

  function signedIn(): FakeUser {
    if (!current) throw new ApiError(401, { message: 'Unauthorized' });
    return current;
  }

  function addUser(email: string, password = testPassword): FakeUser {
    const id = `01900000-0000-7000-8000-${String(nextId++).padStart(12, '0')}`;
    const preferences: UserPreferences = {
      displayCalendar: 'jalali',
      digits: 'persian',
      theme: 'system',
    };
    const user = { id, email, password, preferences };
    users.set(email, user);
    return user;
  }

  function session(user: FakeUser): Session {
    current = user;
    return {
      user: { id: user.id, email: user.email },
      accessTokenExpiresAt: '2026-10-10T10:15:00.000Z',
      refreshTokenExpiresAt: '2026-11-09T10:00:00.000Z',
    };
  }

  if (signedInAs) current = addUser(signedInAs);

  const api: ApiClient = {
    async register({ email, password }) {
      if (users.has(email)) throw new ApiError(409, { message: 'Email is already registered' });
      return session(addUser(email, password));
    },
    async login({ email, password }) {
      const user = users.get(email);
      if (!user || user.password !== password) {
        throw new ApiError(401, { message: 'Email or password is incorrect' });
      }
      return session(user);
    },
    async me(): Promise<Me> {
      const user = signedIn();
      return {
        user: { id: user.id, email: user.email },
        preferences: { ...user.preferences },
        workspaces: [{ ...workspace }],
      };
    },
    async updateWorkspace(workspaceId, input) {
      signedIn();
      if (workspaceId !== workspace.id) throw new ApiError(404, { message: 'Not Found' });
      if (!hasRole(workspace.role, 'ADMIN')) throw new ApiError(403, { message: 'Forbidden' });
      workspace = { ...workspace, ...input };
      return { ...workspace };
    },
    async updatePreferences(input) {
      const user = signedIn();
      user.preferences = { ...user.preferences, ...input };
      return { ...user.preferences };
    },
  };

  return {
    api,
    addUser,
    signedInUser: () => current?.email,
    workspace: () => workspace,
    preferences: () => signedIn().preferences,
  };
}
export type FakeApi = ReturnType<typeof fakeApi>;
