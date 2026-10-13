import { describe, expect, it } from 'vitest';
import { secureStoreTokens } from './tokens';
import type { SecureStore } from './tokens';

function fakeSecureStore(initial: Record<string, string> = {}): SecureStore & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => void values.set(key, value),
    deleteItemAsync: async (key) => void values.delete(key),
  };
}

describe('secureStoreTokens', () => {
  it('keeps the tokens in SecureStore across app starts', async () => {
    const store = fakeSecureStore();
    await secureStoreTokens(store).write({ accessToken: 'a', refreshToken: 'r' });
    expect(await secureStoreTokens(store).read()).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('reads as signed out when nothing is kept', async () => {
    expect(await secureStoreTokens(fakeSecureStore()).read()).toBeUndefined();
  });

  it('forgets the tokens on sign-out', async () => {
    const store = fakeSecureStore();
    const tokens = secureStoreTokens(store);
    await tokens.write({ accessToken: 'a', refreshToken: 'r' });
    await tokens.write(undefined);
    expect(await tokens.read()).toBeUndefined();
    expect(store.values.size).toBe(0);
  });

  it('reads anything else kept under its key as signed out', async () => {
    const store = fakeSecureStore({ 'daric.tokens': '{"accessToken":1}' });
    expect(await secureStoreTokens(store).read()).toBeUndefined();
    const garbled = fakeSecureStore({ 'daric.tokens': 'not json' });
    expect(await secureStoreTokens(garbled).read()).toBeUndefined();
  });
});
