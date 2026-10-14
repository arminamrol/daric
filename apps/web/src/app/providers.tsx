import { type ApiClient, createApiClient } from '@daric/api-client';
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
  api,
  children,
}: {
  api?: ApiClient | undefined;
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { gcTime: KEPT_FOR } } }),
  );
  // The API is served from the web app's origin (Vite proxies `/v1` in development).
  const [client] = useState(() => api ?? createApiClient());

  return (
    <ApiProvider value={client}>
      <QueryClientProvider client={queryClient}>
        {/* Inside the query cache: a signed-in User's language comes with them. */}
        <LocaleProvider>
          <OfflineProvider>{children}</OfflineProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}
