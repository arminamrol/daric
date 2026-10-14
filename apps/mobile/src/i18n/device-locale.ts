import { parseLocale } from '@daric/core';
import type { Locale } from '@daric/core';
import type { Settings } from '../storage/settings';

const LOCALE_KEY = 'daric.locale';

/**
 * The language this device starts in: the last one chosen here or saved by
 * the signed-in User, else Persian. It is read before anything is shown, since
 * it decides the layout direction (see `rtl.ts`).
 */
export function deviceLocale(settings: Pick<Settings, 'get'>): Locale {
  return parseLocale(settings.get(LOCALE_KEY));
}

export function rememberLocale(settings: Pick<Settings, 'set'>, locale: Locale): void {
  settings.set(LOCALE_KEY, locale === 'fa' ? null : locale);
}
