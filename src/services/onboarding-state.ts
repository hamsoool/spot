/**
 * First-launch onboarding persistence.
 *
 * A single boolean records whether the user has finished (or skipped) the
 * first-run onboarding flow. It lives in AsyncStorage under its own versioned
 * key, following the `spot.<area>.v1` convention of the settings cache:
 *  - Local-only by design: onboarding completion is device state, not a user
 *    setting, so it is never synced to Firestore and needs no sign-in.
 *  - Never throws: every read/write failure is logged and swallowed, landing
 *    on the safe default — a broken store shows onboarding again.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'spot.onboarding.completed.v1';

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_KEY)) === '1';
  } catch (error) {
    console.warn('[onboarding] completion read failed, assuming first run:', error);
    return false;
  }
}

export async function completeOnboarding(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
  } catch (error) {
    console.warn('[onboarding] completion write failed:', error);
  }
}

/** Dev/testing escape hatch: reset the flag so onboarding shows again. */
export async function resetOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
  } catch (error) {
    console.warn('[onboarding] reset failed:', error);
  }
}
