import { ApiError, createApiClient, memoryTokenStore } from '@daric/api-client';
import type { ApiClient } from '@daric/api-client';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createContext, use } from 'react';
import { secureStoreTokens } from '../auth/tokens';

/**
 * Where the API is: `EXPO_PUBLIC_API_URL` when set, else port 3000 on the
 * machine Metro serves the app from. `localhost` would be the phone or
 * emulator itself, so a development build asks Metro's host instead.
 */
const API_URL =
  process.env['EXPO_PUBLIC_API_URL'] ??
  `http://${Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost'}:3000`;
/** The refresh token of a logout the API could not be told of yet. */
const LOGOUT_PENDING = 'daric.logoutPending';

const tokens = secureStoreTokens(SecureStore);

/** The API client of the mobile app: bearer tokens kept in SecureStore (ADR-0006). */
export function createMobileApi(): ApiClient {
  return createApiClient({ baseUrl: API_URL, tokens });
}

/**
 * Logs out. The tokens are forgotten either way; when the API cannot be
 * reached, the refresh token is kept aside so a later start can end the
 * Signed-in Device on the server too (`finishPendingLogout`).
 */
export async function logOut(api: ApiClient): Promise<void> {
  const refreshToken = (await tokens.read())?.refreshToken;
  try {
    await api.logout();
  } catch (error) {
    if (refreshToken && !(error instanceof ApiError)) {
      await SecureStore.setItemAsync(LOGOUT_PENDING, refreshToken);
    }
  }
}

/** Tells the API of a logout made offline, if one waits; it tries again next time when offline. */
export async function finishPendingLogout(): Promise<void> {
  const refreshToken = await SecureStore.getItemAsync(LOGOUT_PENDING);
  if (!refreshToken) return;
  const once = createApiClient({
    baseUrl: API_URL,
    tokens: memoryTokenStore({ accessToken: '', refreshToken }),
  });
  try {
    await once.logout();
  } catch (error) {
    if (!(error instanceof ApiError)) return;
  }
  await SecureStore.deleteItemAsync(LOGOUT_PENDING);
}

const ApiContext = createContext<ApiClient | null>(null);

export const ApiProvider = ApiContext;

export function useApi(): ApiClient {
  const api = use(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
