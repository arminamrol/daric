import { describe, expect, it } from 'vitest';
import { en, fa } from './index';
import type { MessageKey } from './index';

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();

describe('dictionaries', () => {
  it('give every Persian message in English too, and nothing Persian lacks', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fa).sort());
  });

  it('use the same placeholders in English as in Persian', () => {
    for (const [key, message] of Object.entries(en)) {
      expect(placeholders(message), key).toEqual(placeholders(fa[key as MessageKey]));
    }
  });

  it('leave no message empty', () => {
    for (const [key, message] of [...Object.entries(fa), ...Object.entries(en)]) {
      expect(message.trim(), key).not.toBe('');
    }
  });
});
