const KEY = 'daric.invitation';

/**
 * The token of an Invitation link opened while signed out, kept in this tab
 * until the visitor has logged in or signed up and can accept it.
 * Storage may be unavailable: then the link has to be opened again.
 */
export const pendingInvitation = {
  get(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) sessionStorage.setItem(KEY, token);
      else sessionStorage.removeItem(KEY);
    } catch {
      // Not kept.
    }
  },
};
