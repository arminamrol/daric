import { signedOutChannel } from '@daric/api-client';
import { type SignedOutReason, signedOutReasonSchema } from '@daric/core';
import { storedFlag } from '../lib/storedFlag';

const KEY = 'daric.signedOut';
const channel = signedOutChannel();

/**
 * Whether this browser holds a Signed-in Device, as far as it knows: set when
 * it signs in or the API names the User, cleared when it forgets the session.
 * Only then is a 401 worth a refresh; a visitor who never signed in skips it.
 */
export const hasSignedIn = storedFlag('daric.signedIn');

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
 * The API refused to refresh: this Signed-in Device is signed out. Remembers why, if told, and has the app forget the session.
 * A later refusal without a reason (another tab's) keeps the one given.
 */
export function reportSignedOut(reason: SignedOutReason | undefined): void {
  if (reason) signedOutNotice.set(reason);
  channel.report(reason);
}

/** Runs `listener` whenever this Signed-in Device is found signed out; returns the unsubscribe. */
export const onSignedOut = channel.subscribe;
