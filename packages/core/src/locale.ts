/** The languages Daric speaks; Persian first, as the default. */
export const locales = ['fa', 'en'] as const;
export type Locale = (typeof locales)[number];
/** The digit shapes numbers are shown in. */
export const digitSystems = ['persian', 'latin'] as const;
export type Digits = (typeof digitSystems)[number];

/** Replaces ASCII digits with Persian (Extended Arabic-Indic) digits. */
export function toPersianDigits(text: string): string {
  return text.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
}
