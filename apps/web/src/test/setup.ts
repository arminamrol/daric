import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.head.innerHTML = '';
  for (const name of ['lang', 'dir', 'data-theme']) document.documentElement.removeAttribute(name);
});
