export type Locale = 'fa' | 'en';
export type Digits = 'persian' | 'latin';

/** Replaces ASCII digits with Persian (Extended Arabic-Indic) digits. */
export function toPersianDigits(text: string): string {
  return text.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
}
