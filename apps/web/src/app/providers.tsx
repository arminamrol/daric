import type { Locale } from '@daric/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { LocaleProvider } from '../i18n/locale';

/** App-wide context: locale and the TanStack Query cache. */
export function AppProviders({ locale, children }: { locale?: Locale; children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <LocaleProvider {...(locale && { locale })}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </LocaleProvider>
  );
}
