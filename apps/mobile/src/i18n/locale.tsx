import type { Locale } from '@daric/core';
import { createTranslator, direction } from '@daric/i18n';
import type { Direction, Translate } from '@daric/i18n';
import { createContext, use, useMemo } from 'react';
import type { ReactNode } from 'react';

interface I18n {
  readonly locale: Locale;
  readonly dir: Direction;
  readonly t: Translate;
}

const I18nContext = createContext<I18n | null>(null);

/** Provides the active locale; the layout direction is set at start (see `rtl.ts`). */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(
    () => ({ locale, dir: direction(locale), t: createTranslator(locale) }),
    [locale],
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const i18n = use(I18nContext);
  if (!i18n) throw new Error('useI18n must be used inside <LocaleProvider>');
  return i18n;
}
