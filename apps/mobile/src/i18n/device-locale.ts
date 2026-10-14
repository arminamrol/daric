import { locales } from '@daric/core';
import type { Locale } from '@daric/core';
import type { Settings } from '../storage/settings';

const LOCALE = 'daric.locale';

/**
 * The language this device starts in: the last one chosen here or saved by
 * the signed-in User, else Persian. It is read before anything is shown, since
 * it decides the layout direction (see `rtl.ts`).
 */
export function deviceLocale(settings: Pick<Settings, 'get'>): Locale {
  const stored = settings.get(LOCALE);
  return locales.find((locale) => locale === stored) ?? 'fa';
}

export function rememberLocale(settings: Pick<Settings, 'set'>, locale: Locale): void {
  settings.set(LOCALE, locale === 'fa' ? null : locale);
}
