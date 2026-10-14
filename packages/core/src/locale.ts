/** The languages Daric speaks; Persian first, as the default. */
export const locales = ['fa', 'en'] as const;
export type Locale = (typeof locales)[number];

/** `value` as a Locale, or Persian when it is none (nothing stored, or a stale value). */
export function parseLocale(value: string | null | undefined): Locale {
  return locales.find((locale) => locale === value) ?? 'fa';
}
/** The digit shapes numbers are shown in. */
export const digitSystems = ['persian', 'latin'] as const;
export type Digits = (typeof digitSystems)[number];

/** Replaces ASCII digits with Persian (Extended Arabic-Indic) digits. */
export function toPersianDigits(text: string): string {
  return text.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
}
