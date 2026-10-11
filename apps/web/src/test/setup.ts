import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach } from 'vitest';
import { resetNetwork } from './network';

afterEach(() => {
  cleanup();
  localStorage.clear();
  // A fresh IndexedDB, so nothing one test kept reaches the next.
  globalThis.indexedDB = new IDBFactory();
  resetNetwork();
  document.head.innerHTML = '';
  for (const name of ['lang', 'dir', 'data-theme']) document.documentElement.removeAttribute(name);
});
