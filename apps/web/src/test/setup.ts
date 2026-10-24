import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach } from 'vitest';
import { resetNetwork } from './network';

// Browser APIs jsdom lacks that the Radix primitives call: popups measure their trigger, and a
// select scrolls its chosen option into view.
globalThis.ResizeObserver ??= class {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
};
Element.prototype.scrollIntoView ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => undefined;

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  // A fresh IndexedDB, so nothing one test kept reaches the next.
  globalThis.indexedDB = new IDBFactory();
  resetNetwork();
  document.head.innerHTML = '';
  for (const name of ['lang', 'dir', 'data-theme']) document.documentElement.removeAttribute(name);
});
