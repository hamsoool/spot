/**
 * Stage 8 — the single place that decides whether Firebase exists in this build.
 *
 * Firebase is optional by construction (A16): `google-services.json` is gitignored and `android/`
 * is generated, so a clone, a CI job or an EAS build that has no `GOOGLE_SERVICES_JSON` secret
 * produces an app with no Firebase native config at all. `app.config.js` records that fact in
 * `extra.firebaseConfigured`, and every Firebase entry point below returns `null` instead of
 * throwing when it is false, so a missing Firestore can never take the firewall down
 * (Stage 8 acceptance criterion 2).
 */
import Constants from 'expo-constants';
import { getApp } from '@react-native-firebase/app';
import { getAuth, type Auth } from '@react-native-firebase/auth';
import { getFirestore, type Firestore } from '@react-native-firebase/firestore';

/** True only when this binary was prebuilt with a real google-services.json. */
export const firebaseConfigured: boolean =
  Constants.expoConfig?.extra?.firebaseConfigured === true;

/**
 * Auth handle, or null when Firebase is absent or the native module refuses to answer.
 * Native init happens in the RNFirebase native layer, so there is no initializeApp() to call.
 */
export function firebaseAuth(): Auth | null {
  if (!firebaseConfigured) return null;
  try {
    return getAuth(getApp());
  } catch (error) {
    console.warn('[firebase] auth unavailable:', error);
    return null;
  }
}

/** Firestore handle, or null under the same conditions as `firebaseAuth()`. */
export function firebaseDb(): Firestore | null {
  if (!firebaseConfigured) return null;
  try {
    return getFirestore(getApp());
  } catch (error) {
    console.warn('[firebase] firestore unavailable:', error);
    return null;
  }
}
