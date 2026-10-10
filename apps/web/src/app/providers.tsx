import { type ApiClient, createApiClient } from '@daric/api-client';
import type { Locale } from '@daric/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ApiProvider } from '../api/api';
import { LocaleProvider } from '../i18n/locale';

/** App-wide context: locale, the API client and the TanStack Query cache. */
export function AppProviders({
  locale,
  api,
  children,
}: {
  locale?: Locale | undefined;
  api?: ApiClient | undefined;
  children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());
  // The API is served from the web app's origin (Vite proxies `/v1` in development).
  const [client] = useState(() => api ?? createApiClient());

  return (
    <LocaleProvider locale={locale}>
      <ApiProvider value={client}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiProvider>
    </LocaleProvider>
  );
}
