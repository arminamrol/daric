import { type ApiClient, createApiClient } from '@daric/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiProvider } from '../api/api';
import { useForgetWhenSignedOut } from '../auth/logout';
import { hasSignedIn, reportSignedOut } from '../auth/signedOut';
import { LocaleProvider, useI18n } from '../i18n/locale';
import { OfflineProvider } from '../offline/offline';
import { UiProvider } from '../ui/UiProvider';

/** A day: the cache kept on an Offline Device holds what was not used for that long. */
const KEPT_FOR = 24 * 60 * 60 * 1000;

/**
 * App-wide context: locale, the API client, the TanStack Query cache, the UI primitives' direction
 * and words, and offline support.
 */
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
  const [client] = useState(
    () => api ?? createApiClient({ onSignedOut: reportSignedOut, mayRefresh: hasSignedIn.get }),
  );

  return (
    <ApiProvider value={client}>
      <QueryClientProvider client={queryClient}>
        {/* Inside the query cache: a signed-in User's language comes with them. */}
        <LocaleProvider>
          <LocalizedUi>
            <OfflineProvider>
              <ForgetWhenSignedOut />
              {children}
            </OfflineProvider>
          </LocalizedUi>
        </LocaleProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}

function ForgetWhenSignedOut() {
  useForgetWhenSignedOut();
  return null;
}

/** The UI primitives in the active language and direction. */
function LocalizedUi({ children }: { children: ReactNode }) {
  const { t, dir } = useI18n();
  const labels = useMemo(
    () => ({ close: t('ui.close'), notifications: t('ui.notifications') }),
    [t],
  );
  return (
    <UiProvider dir={dir} labels={labels}>
      {children}
    </UiProvider>
  );
}
