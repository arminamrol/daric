import type { ThemePreference } from '@daric/core';
import { themes } from '@daric/design-tokens';
import type { ThemeName } from '@daric/design-tokens';
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../auth/session';
import { useUpdatePreferences } from '../settings/settings';

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
 * `prefers-color-scheme` when the attribute is absent. The browser bar follows through the
 * per-scheme `theme-color` tags in index.html, which a pinned theme recolors.
 */
function applyPreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme: ThemeName = meta.getAttribute('media')?.includes('dark') ? 'dark' : 'light';
    meta.content = themes[preference === 'system' ? scheme : preference].surface;
  }
}

/**
 * The theme: `system` follows the operating system, the others pin one. A
 * signed-in User's choice is one of their preferences and follows them to
 * every device; this device also remembers the last one, so the inline script
 * can paint it before the User is known.
 */
export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void] {
  const me = useMe().data;
  const { mutate: updatePreferences } = useUpdatePreferences();
  const [local, setLocal] = useState(readPreference);
  const signedIn = Boolean(me);
  const preference = me ? me.preferences.theme : local;
  // Keep the User's theme as this device's own, so it stays after they sign out.
  if (me && local !== preference) setLocal(preference);

  useEffect(() => {
    applyPreference(preference);
    savePreference(preference);
  }, [preference]);

  const choose = useCallback(
    (next: ThemePreference) => {
      setLocal(next);
      if (signedIn) updatePreferences({ theme: next });
    },
    [signedIn, updatePreferences],
  );

  return [preference, choose];
}
