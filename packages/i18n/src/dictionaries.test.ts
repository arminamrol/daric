import { describe, expect, it } from 'vitest';
import { en, fa } from './index';
import type { MessageKey } from './index';

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();

describe('dictionaries', () => {
  it('use the same placeholders in English as in Persian', () => {
    for (const [key, message] of Object.entries(en)) {
      expect(placeholders(message), key).toEqual(placeholders(fa[key as MessageKey]));
    }
  });
});
