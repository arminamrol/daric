import { ApiError, type ApiClient } from '@daric/api-client';
import type { Me, Session } from '@daric/core';

export const testPassword = 'correct horse battery';

interface FakeUser {
  id: string;
  email: string;
  password: string;
}

/**
 * An in-memory stand-in for the API, as the browser sees it: the session is
 * the server's business, so the fake keeps it and answers `me()` from it.
 */
export function fakeApi({ signedInAs }: { signedInAs?: string } = {}) {
  const users = new Map<string, FakeUser>();
  let current: FakeUser | undefined;
  let nextId = 1;

  function addUser(email: string, password = testPassword): FakeUser {
    const id = `01900000-0000-7000-8000-${String(nextId++).padStart(12, '0')}`;
    const user = { id, email, password };
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
      if (!current) throw new ApiError(401, { message: 'Unauthorized' });
      return {
        user: { id: current.id, email: current.email },
        workspaces: [
          {
            id: '01900000-0000-7000-9000-000000000001',
            type: 'PERSONAL',
            name: 'Personal',
            baseCurrency: 'IRR',
            calendar: 'jalali',
            timezone: 'Asia/Tehran',
            role: 'OWNER',
          },
        ],
      };
    },
  };

  return { api, addUser, signedInUser: () => current?.email };
}
export type FakeApi = ReturnType<typeof fakeApi>;
