/**
 * Small device-local values read synchronously at start: the "keep data"
 * answer, the last picks of fast entry, the layout-direction reload marker.
 */
export interface Settings {
  get(key: string): string | null;
  /** Null removes the value. */
  set(key: string, value: string | null): void;
  keys(): string[];
}

/** Settings in memory only; for tests. */
export function memorySettings(): Settings {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void (value === null ? values.delete(key) : values.set(key, value)),
    keys: () => [...values.keys()],
  };
}
