import { parseLocale } from '@daric/core';
import type { Locale } from '@daric/core';
import { createTranslator, direction } from '@daric/i18n';
import type { Direction, Translate } from '@daric/i18n';
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMe } from '../auth/session';
import { useUpdatePreferences } from '../settings/settings';

/** Also read by the inline script in index.html, which sets `<html lang dir>` before first paint. */
export const LOCALE_STORAGE_KEY = 'daric.locale';

interface I18n {
  readonly locale: Locale;
  readonly dir: Direction;
  readonly t: Translate;
  readonly setLocale: (locale: Locale) => void;
  /** Whether the User's last choice failed to save; the language stays as it was. */
  readonly saveFailed: boolean;
}

const I18nContext = createContext<I18n | null>(null);

function readLocale(): Locale {
  try {
    return parseLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return 'fa';
  }
}

function saveLocale(locale: Locale): void {
  try {
    if (locale === 'fa') localStorage.removeItem(LOCALE_STORAGE_KEY);
    else localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this page only.
  }
}

/**
 * Provides the active locale and keeps `<html lang dir>` and the page title in
 * step with it; the stylesheet picks the font by `lang`. A signed-in User's
 * language is one of their preferences and follows them to every device; this
 * device also remembers the last one, so the inline script can lay out the
 * page in it before the User is known.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const me = useMe().data;
  const { mutate: updatePreferences, isError: saveFailed } = useUpdatePreferences();
  const [deviceLocale, setDeviceLocale] = useState(readLocale);
  const signedIn = Boolean(me);
  const locale = me ? me.preferences.locale : deviceLocale;
  // Keep the User's language as this device's own, so it stays after they sign out.
  if (me && deviceLocale !== locale) setDeviceLocale(locale);

  const setLocale = useCallback(
    (next: Locale) => {
      setDeviceLocale(next);
      if (signedIn) updatePreferences({ locale: next });
    },
    [signedIn, updatePreferences],
  );

  const value = useMemo(
    () => ({
      locale,
      dir: direction(locale),
      t: createTranslator(locale),
      setLocale,
      saveFailed,
    }),
    [locale, setLocale, saveFailed],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.lang = value.locale;
    root.dir = value.dir;
    document.title = value.t('app.name');
    saveLocale(value.locale);
  }, [value]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const i18n = use(I18nContext);
  if (!i18n) throw new Error('useI18n must be used inside <LocaleProvider>');
  return i18n;
}
