import { type SignedOutReason, signedOutReasonSchema } from '@daric/core';

const KEY = 'daric.signedOut';
const listeners = new Set<() => void>();

/**
 * Why the server last signed this browser out, kept until the next sign-in
 * so the login page can say so. Storage may be unavailable: then it is not said.
 */
export const signedOutNotice = {
  get(): SignedOutReason | null {
    try {
      const parsed = signedOutReasonSchema.safeParse(localStorage.getItem(KEY));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
  set(reason: SignedOutReason | null) {
    try {
      if (reason) localStorage.setItem(KEY, reason);
      else localStorage.removeItem(KEY);
    } catch {
      // Not said.
    }
  },
};

/**
 * The API refused to refresh the session: this Signed-in Device is signed
 * out. Remembers why, if told, and has the app forget the session.
 * A later refusal without a reason (another tab's) keeps the one given.
 */
export function reportSignedOut(reason: SignedOutReason | undefined): void {
  if (reason) signedOutNotice.set(reason);
  for (const listener of listeners) listener();
}

/** Runs `listener` whenever the session is found signed out; returns the unsubscribe. */
export function onSignedOut(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
