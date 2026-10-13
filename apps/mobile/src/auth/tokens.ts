import type { Tokens, TokenStore } from '@daric/api-client';

/** The slice of expo-secure-store the token store uses. */
export interface SecureStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const KEY = 'daric.tokens';

function isTokens(value: unknown): value is Tokens {
  if (!value || typeof value !== 'object') return false;
  const { accessToken, refreshToken } = value as Record<string, unknown>;
  return typeof accessToken === 'string' && typeof refreshToken === 'string';
}

/** Keeps the Signed-in Device's tokens in SecureStore, the platform keychain (ADR-0006). */
export function secureStoreTokens(store: SecureStore): TokenStore {
  return {
    async read() {
      const stored = await store.getItemAsync(KEY);
      if (!stored) return undefined;
      try {
        const parsed: unknown = JSON.parse(stored);
        return isTokens(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    },
    async write(tokens) {
      if (tokens) await store.setItemAsync(KEY, JSON.stringify(tokens));
      else await store.deleteItemAsync(KEY);
    },
  };
}
