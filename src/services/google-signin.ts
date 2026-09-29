/**
 * Google Sign-In bridge, preferring the installed native package and telling
 * the caller exactly why it is unavailable when that is not possible.
 *
 * The native module only exists in builds made after the dependency was
 * added (`expo install` + `prebuild`/EAS build): prebuilt binaries and the
 * web bundler have no such module. Every screen goes through this file
 * instead of importing the package directly, so a missing native module
 * degrades to "not available" instead of a redbox at import time.
 *
 * Configuration notes (operator checklist, not code):
 *  - Firebase console → Authentication → Sign-in method → enable Google.
 *  - google-services.json must carry an Android OAuth client (client_type 1)
 *    for this package name, which only appears after the app's SHA-1 is
 *    registered in the Firebase console — see ANDROID_IMPLEMENTATION_PLAN A17.
 *  - webClientId below is the type-3 (server) client id from the same page.
 */

import { Platform } from 'react-native';

export type GoogleSigninUnavailableReason =
  | 'web'
  | 'missing-package'
  | 'missing-native-module';

export interface GoogleSigninLike {
  configure(options: {
    webClientId?: string;
    offlineAccess?: boolean;
    scopes?: string[];
  }): void;
  hasPlayServices(options?: { showPlayServicesUpdateDialog?: boolean }): Promise<void>;
  signIn(): Promise<{ data?: { idToken?: string | null } | null; idToken?: string | null }>;
  signOut(): Promise<void>;
}

export interface GoogleSigninLoadResult {
  api: GoogleSigninLike | null;
  reason: GoogleSigninUnavailableReason | null;
}

export async function loadGoogleSignin(): Promise<GoogleSigninLoadResult> {
  if (Platform.OS === 'web') return { api: null, reason: 'web' };
  let mod: unknown;
  try {
    // Metro resolves this only when the code path runs, so web and stale
    // native builds that lack the package still bundle and launch.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-google-signin/google-signin');
  } catch {
    return { api: null, reason: 'missing-package' };
  }
  const api = (mod as { GoogleSignin?: GoogleSigninLike; default?: GoogleSigninLike })
    ?.GoogleSignin;
  if (!api || typeof api.signIn !== 'function') {
    return { api: null, reason: 'missing-native-module' };
  }
  return { api, reason: null };
}

/** Web client id from the prebuilt google-services.json OAuth client. */
export const GOOGLE_WEB_CLIENT_ID =
  '2531319819-sq02o1t41otjtvvug0k9mgh7b4vll2vh.apps.googleusercontent.com';
