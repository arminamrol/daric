/** The tokens the mobile app holds for its Signed-in Device (ADR-0006). */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** Where the mobile app keeps its tokens; SecureStore on a phone. */
export interface TokenStore {
  read(): Promise<Tokens | undefined>;
  /** Replaces the tokens; undefined forgets them (signed out). */
  write(tokens: Tokens | undefined): Promise<void>;
}

/** Keeps the tokens in memory only; for tests. */
export function memoryTokenStore(initial?: Tokens): TokenStore {
  let tokens = initial;
  return {
    read: async () => tokens && { ...tokens },
    write: async (next) => void (tokens = next && { ...next }),
  };
}
