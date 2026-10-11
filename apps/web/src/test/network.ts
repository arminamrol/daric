import { onlineManager } from '@tanstack/react-query';
import type { FakeApi } from './fake-api';

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  // TanStack Query hears those events only while an app is mounted; between renders it would not.
  onlineManager.setOnline(value);
}

/** The browser loses its connection: it knows, and every API call fails. */
export function goOffline(fake: FakeApi) {
  fake.setOffline(true);
  setOnLine(false);
}

/** The connection comes back, and the browser says so. */
export function goOnline(fake: FakeApi) {
  fake.setOffline(false);
  setOnLine(true);
}

/** Back to a browser that is online, between tests. */
export function resetNetwork() {
  Reflect.deleteProperty(navigator, 'onLine');
  onlineManager.setOnline(true);
}
