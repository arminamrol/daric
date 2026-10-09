import { useCallback, useEffect, useState } from 'react';

/** `system` follows the operating system; the others pin a theme on this device. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Also read by the inline script in index.html, which applies the theme before first paint. */
export const THEME_STORAGE_KEY = 'daric.theme';

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function savePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this page only.
  }
}

/**
 * The design-token stylesheet switches colors on `<html data-theme>` and falls back to
 * `prefers-color-scheme` when the attribute is absent.
 */
function applyPreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

/** The device's theme preference, remembered across visits. */
export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void] {
  const [preference, setPreference] = useState(readPreference);

  useEffect(() => applyPreference(preference), [preference]);

  const choose = useCallback((next: ThemePreference) => {
    savePreference(next);
    setPreference(next);
  }, []);

  return [preference, choose];
}
