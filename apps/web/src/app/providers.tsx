import { type ApiClient, createApiClient } from '@daric/api-client';
import type { Locale } from '@daric/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ApiProvider } from '../api/api';
import { LocaleProvider } from '../i18n/locale';
import { OfflineProvider } from '../offline/offline';

/** A day: the cache kept on an Offline Device holds what was not used for that long. */
const KEPT_FOR = 24 * 60 * 60 * 1000;

/** App-wide context: locale, the API client, the TanStack Query cache and offline support. */
export function AppProviders({
  locale,
  api,
  children,
}: {
  locale?: Locale | undefined;
  api?: ApiClient | undefined;
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { gcTime: KEPT_FOR } } }),
  );
  // The API is served from the web app's origin (Vite proxies `/v1` in development).
  const [client] = useState(() => api ?? createApiClient());

  return (
    <LocaleProvider locale={locale}>
      <ApiProvider value={client}>
        <QueryClientProvider client={queryClient}>
          <OfflineProvider>{children}</OfflineProvider>
        </QueryClientProvider>
      </ApiProvider>
    </LocaleProvider>
  );
}
