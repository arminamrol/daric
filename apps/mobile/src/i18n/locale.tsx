import type { Locale, Me } from '@daric/core';
import { createTranslator, direction } from '@daric/i18n';
import type { Direction, Translate } from '@daric/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useApi } from '../api/api';
import { ME_QUERY_KEY, useMe } from '../auth/session';
import { FONTS } from '../ui/fonts';
import type { Font } from '../ui/fonts';

interface I18n {
  readonly locale: Locale;
  readonly dir: Direction;
  readonly t: Translate;
  readonly font: Font;
  /** Switches the language: saved for a signed-in User first, so it fails visibly. */
  readonly setLocale: (locale: Locale) => Promise<void>;
}

const I18nContext = createContext<I18n | null>(null);

/**
 * Provides the active locale. The app starts in this device's language; a
 * signed-in User's saved one wins, so it follows them to every device.
 * `onChange` restarts the app in a new language when its direction changes
 * (see `rtl.ts`).
 */
export function LocaleProvider({
  locale,
  onChange,
  children,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
  children: ReactNode;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const saved = me?.preferences.locale;
  const signedIn = Boolean(me);

  useEffect(() => {
    if (saved && saved !== locale) onChange(saved);
  }, [saved, locale, onChange]);

  const setLocale = useCallback(
    async (next: Locale) => {
      if (signedIn) {
        const preferences = await api.updatePreferences({ locale: next });
        // Else the User's old language, still cached, would switch the app straight back.
        queryClient.setQueryData<Me | null>(ME_QUERY_KEY, (me) => me && { ...me, preferences });
      }
      onChange(next);
    },
    [api, queryClient, signedIn, onChange],
  );

  const value = useMemo(
    () => ({
      locale,
      dir: direction(locale),
      t: createTranslator(locale),
      font: FONTS[locale],
      setLocale,
    }),
    [locale, setLocale],
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const i18n = use(I18nContext);
  if (!i18n) throw new Error('useI18n must be used inside <LocaleProvider>');
  return i18n;
}
