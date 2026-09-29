/**
 * Auth error UX copy.
 *
 * Firebase Auth rejects with machine codes (`auth/wrong-password`,
 * `auth/network-request-failed`, …). One mapping table turns them into copy
 * a settings-screen banner can show, so no screen hand-rolls its own strings.
 * Unknown codes (new provider errors, quota notes) fall through to the raw
 * message rather than a wrong guess.
 */

type KnownAuthCode =
  | 'auth/email-already-in-use'
  | 'auth/user-not-found'
  | 'auth/wrong-password'
  | 'auth/invalid-credential'
  | 'auth/invalid-email'
  | 'auth/weak-password'
  | 'auth/too-many-requests'
  | 'auth/network-request-failed'
  | 'auth/requires-recent-login'
  | 'auth/account-exists-with-different-credential'
  | 'auth/operation-not-allowed'
  | 'auth/user-disabled'
  | 'auth/credential-already-in-use'
  | 'auth/provider-already-linked';

const AUTH_ERROR_MESSAGES: Record<KnownAuthCode, string> = {
  'auth/email-already-in-use': 'That email already has an account. Try signing in instead.',
  'auth/user-not-found': 'No account found for that email. Try creating one.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'That email or password is incorrect. Please try again.',
  'auth/invalid-email': 'That email address does not look valid.',
  'auth/weak-password': 'Please choose a password of at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts — please wait a minute and try again.',
  'auth/network-request-failed': 'You appear to be offline. Check your connection and try again.',
  'auth/requires-recent-login': 'For security, please sign in again before making this change.',
  'auth/account-exists-with-different-credential':
    'That email is already linked to a different sign-in method. Sign in with it first, then link Google.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled yet. Please try again later.',
  'auth/user-disabled': 'This account has been disabled. Contact support for help.',
  'auth/credential-already-in-use': 'That Google account is already used by another profile.',
  'auth/provider-already-linked': 'This sign-in method is already linked to your account.',
};

/** Machine error → human sentence. Never throws; falls back to the raw message. */
export function authErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      const known = AUTH_ERROR_MESSAGES[code as KnownAuthCode];
      if (known) return known;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

/** Trimmed email that satisfies Firebase's minimum shape (local@domain.tld). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Firebase's minimum password length, enforced client-side first. */
export function isValidPassword(password: string): boolean {
  return password.length >= 6;
}
