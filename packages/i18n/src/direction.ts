import type { Locale } from '@daric/core';

export type Direction = 'rtl' | 'ltr';

const DIRECTIONS: Readonly<Record<Locale, Direction>> = { fa: 'rtl', en: 'ltr' };

/** The writing direction of `locale`, for the `dir` attribute and layout. */
export function direction(locale: Locale): Direction {
  return DIRECTIONS[locale];
}

/**
 * Wraps text from outside the dictionary (a path, an account name) in Unicode first-strong
 * isolate marks, so a Latin value inside a Persian message (or the reverse) keeps its own
 * direction and does not reorder the words around it.
 */
export function isolate(text: string): string {
  return `⁨${text}⁩`;
}
