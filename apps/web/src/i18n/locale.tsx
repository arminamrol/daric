import type { Locale } from '@daric/core';
import { createTranslator, direction } from '@daric/i18n';
import type { Direction, Translate } from '@daric/i18n';
import { createContext, use, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';

interface I18n {
  readonly locale: Locale;
  readonly dir: Direction;
  readonly t: Translate;
}

const I18nContext = createContext<I18n | null>(null);

/** Provides the active locale and keeps `<html lang dir>` and the page title in step with it. */
export function LocaleProvider({
  locale = 'fa',
  children,
}: {
  locale?: Locale | undefined;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ locale, dir: direction(locale), t: createTranslator(locale) }),
    [locale],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.lang = value.locale;
    root.dir = value.dir;
    document.title = value.t('app.name');
  }, [value]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const i18n = use(I18nContext);
  if (!i18n) throw new Error('useI18n must be used inside <LocaleProvider>');
  return i18n;
}
