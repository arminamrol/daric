import Storage from 'expo-sqlite/kv-store';
import type { Settings } from './settings';

/** Settings kept in expo-sqlite's key-value store, readable synchronously at start. */
export const deviceSettings: Settings = {
  get: (key) => Storage.getItemSync(key),
  set: (key, value) => {
    if (value === null) Storage.removeItemSync(key);
    else Storage.setItemSync(key, value);
  },
  keys: () => Storage.getAllKeysSync(),
};
