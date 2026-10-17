import type { SignedOutReason } from '@daric/core';

/**
 * Connects the API client's `onSignedOut` to the app parts that react to it
 * (wiping the device), which only exist once the client has been created.
 */
export function signedOutChannel() {
  const listeners = new Set<(reason: SignedOutReason | undefined) => void>();
  return {
    report(reason: SignedOutReason | undefined): void {
      for (const listener of listeners) listener(reason);
    },
    /** Returns the unsubscribe. */
    subscribe(listener: (reason: SignedOutReason | undefined) => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
