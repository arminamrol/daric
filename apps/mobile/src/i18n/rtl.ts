import type { Locale } from '@daric/core';
import { direction } from '@daric/i18n';
import type { Direction } from '@daric/i18n';

/** The slice of React Native's I18nManager that sets the layout direction. */
export interface LayoutDirection {
  readonly isRTL: boolean;
  allowRTL(allow: boolean): void;
  forceRTL(force: boolean): void;
  swapLeftAndRightInRTL(swap: boolean): void;
}

/** Remembers, across a reload, which direction the app reloaded for. */
export interface ReloadMarker {
  get(): string | null;
  set(value: Direction | null): void;
}

/**
 * Sets the layout direction for `locale`. React Native applies a new
 * direction only when the app starts again, so a change answers `reload`;
 * the app then reloads once. Should the direction still not have taken after
 * that reload, it carries on as it is rather than reload forever.
 */
export function applyDirection(
  locale: Locale,
  manager: LayoutDirection,
  marker: ReloadMarker,
): 'ready' | 'reload' {
  const wanted = direction(locale);
  const rtl = wanted === 'rtl';
  manager.allowRTL(true);
  manager.swapLeftAndRightInRTL(true);
  if (manager.isRTL === rtl) {
    marker.set(null);
    return 'ready';
  }
  if (marker.get() === wanted) return 'ready';
  manager.forceRTL(rtl);
  marker.set(wanted);
  return 'reload';
}
