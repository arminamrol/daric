import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { reloadAppAsync } from 'expo';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider, createMobileApi } from '../api/api';
import { LocaleProvider } from '../i18n/locale';
import { applyDirection } from '../i18n/rtl';
import { OfflineProvider } from '../offline/offline';
import { deviceSettings } from '../storage/device-settings';
import { FONT_FILES } from '../ui/fonts';
import { ThemeProvider } from '../ui/theme';

/** Persian only for now; English arrives with its locale (ticket 33). */
const LOCALE = 'fa';
const DIRECTION_RELOAD = 'daric.directionReload';
/** A day: the cache kept on an Offline Device holds what was not used for that long. */
const KEPT_FOR = 24 * 60 * 60 * 1000;

/**
 * The app root. React Native lays out right to left only from the next start
 * after it is asked to, so the first start in a new direction reloads once
 * before showing anything.
 */
export default function RootLayout() {
  const [direction] = useState(() =>
    applyDirection(LOCALE, I18nManager, {
      get: () => deviceSettings.get(DIRECTION_RELOAD),
      set: (value) => deviceSettings.set(DIRECTION_RELOAD, value),
    }),
  );
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { gcTime: KEPT_FOR } } }),
  );
  const [api] = useState(createMobileApi);

  useEffect(() => {
    if (direction === 'reload') void reloadAppAsync('Layout direction changed');
  }, [direction]);

  // Without the font the system one is used, rather than no app at all.
  if (direction === 'reload' || (!fontsLoaded && !fontError)) return null;

  return (
    <SafeAreaProvider>
      <LocaleProvider locale={LOCALE}>
        <ThemeProvider>
          <ApiProvider value={api}>
            <QueryClientProvider client={queryClient}>
              <OfflineProvider>
                <Stack screenOptions={{ headerShown: false }} />
              </OfflineProvider>
            </QueryClientProvider>
          </ApiProvider>
        </ThemeProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
