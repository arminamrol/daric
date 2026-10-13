// Each weight from its own entry, so the bundle carries only the two the app uses.
import { Vazirmatn_400Regular } from '@expo-google-fonts/vazirmatn/400Regular';
import { Vazirmatn_700Bold } from '@expo-google-fonts/vazirmatn/700Bold';

/** Font family names as the app registers them: each weight is its own family on a phone. */
export const FONT = { regular: 'Vazirmatn', bold: 'Vazirmatn-Bold' } as const;

export const FONT_FILES = {
  [FONT.regular]: Vazirmatn_400Regular,
  [FONT.bold]: Vazirmatn_700Bold,
};
