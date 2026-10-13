import { createApiClient } from '@daric/api-client';
import type { ApiClient } from '@daric/api-client';
import * as SecureStore from 'expo-secure-store';
import { createContext, use } from 'react';
import { secureStoreTokens } from '../auth/tokens';

/** Where the API is; set `EXPO_PUBLIC_API_URL` for a phone that cannot reach localhost. */
const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';

/** The API client of the mobile app: bearer tokens kept in SecureStore (ADR-0006). */
export function createMobileApi(): ApiClient {
  return createApiClient({ baseUrl: API_URL, tokens: secureStoreTokens(SecureStore) });
}

const ApiContext = createContext<ApiClient | null>(null);

export const ApiProvider = ApiContext;

export function useApi(): ApiClient {
  const api = use(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
