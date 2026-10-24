import { useSyncExternalStore } from 'react';

/** From here up the app has a sidebar; below it, a phone's bottom tab bar. */
const WIDE = '(min-width: 64rem)';

function query() {
  // Without `matchMedia` (tests, very old browsers) the screen counts as wide.
  return typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : undefined;
}

function subscribe(listener: () => void) {
  const media = query();
  media?.addEventListener('change', listener);
  return () => media?.removeEventListener('change', listener);
}

/** Whether the browser is wide enough for the sidebar; follows resizing and rotation. */
export function useWideScreen() {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? true);
}
