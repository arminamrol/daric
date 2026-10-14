// Each weight from its own entry, so the bundle carries only the two the app uses.
import type { Locale } from '@daric/core';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Vazirmatn_400Regular } from '@expo-google-fonts/vazirmatn/400Regular';
import { Vazirmatn_700Bold } from '@expo-google-fonts/vazirmatn/700Bold';

export interface Font {
  readonly regular: string;
  readonly bold: string;
}

/**
 * Font family names as the app registers them, per language: Vazirmatn for
 * Persian, Inter for English. Each weight is its own family on a phone.
 */
export const FONTS: Readonly<Record<Locale, Font>> = {
  fa: { regular: 'Vazirmatn', bold: 'Vazirmatn-Bold' },
  en: { regular: 'Inter', bold: 'Inter-Bold' },
};

export const FONT_FILES = {
  [FONTS.fa.regular]: Vazirmatn_400Regular,
  [FONTS.fa.bold]: Vazirmatn_700Bold,
  [FONTS.en.regular]: Inter_400Regular,
  [FONTS.en.bold]: Inter_700Bold,
};
