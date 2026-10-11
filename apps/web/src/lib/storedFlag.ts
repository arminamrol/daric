/**
 * A yes/no remembered in localStorage. Storage may be unavailable (private
 * windows, blocked site data): then it reads as no and setting it does nothing.
 */
export function storedFlag(key: string) {
  return {
    get(): boolean {
      try {
        return localStorage.getItem(key) === 'yes';
      } catch {
        return false;
      }
    },
    set(value: boolean) {
      try {
        if (value) localStorage.setItem(key, 'yes');
        else localStorage.removeItem(key);
      } catch {
        // Not remembered.
      }
    },
  };
}
