import type { ApiClient } from '@daric/api-client';
import { createContext, use } from 'react';

const ApiContext = createContext<ApiClient | null>(null);

export const ApiProvider = ApiContext;

/** The API client; tests provide an in-memory one. */
export function useApi(): ApiClient {
  const api = use(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
