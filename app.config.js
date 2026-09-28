/**
 * Dynamic Expo config — Stage 8 (A16) added this file so Firebase can be conditional.
 *
 * Why it exists: @react-native-firebase/app's config plugin takes no props (only `ios.disableSPM`);
 * it reads `expo.android.googleServicesFile` and throws in `withCopyAndroidGoogleServices` when the
 * field is unset OR the file cannot be read. The JSON is gitignored and `android/` is generated
 * (A3), so a plugin entry static in app.json would break `expo prebuild` for every clone, CI job
 * and EAS build that has no Firebase secret - which is every run until the project exists. Presence
 * is therefore decided here, once, at config time, and published to JS as `extra.firebaseConfigured`.
 *
 * The JSON arrives from one of two places, and only one of them can be committed:
 *  1. `process.env.GOOGLE_SERVICES_JSON` - an EAS file secret (`eas env:set --type file`, uploaded
 *     as FileBase64, materialized on the build worker and exposed as a path).
 *  2. `./google-services.json` at the repo root, for local `expo run:android` / `eas build --local`.
 *
 * app.json stays the single source of truth for everything else. This receives the parsed static
 * config through the config request (`({ config }) => ...`) instead of re-requiring app.json:
 * `@expo/config` tags the static object it hands over and checks that the tag survives into the
 * returned config, which is how Expo (and expo-doctor's "config for common issues" check) tells
 * "dynamic config extends the static one" from "dynamic config silently replaces it".
 */
const fs = require('fs');
const path = require('path');

const FIREBASE_PLUGIN = '@react-native-firebase/app';
const FIREBASE_FILE_ENV = 'GOOGLE_SERVICES_JSON';

/** Path to ship to the plugin, a {missing} marker, or null when Firebase is not in this build. */
function resolveFirebaseFile() {
  const fromSecret = process.env[FIREBASE_FILE_ENV];
  if (fromSecret) {
    // Loud on purpose: a typo'd secret must not silently drop Firebase out of a production build.
    return fs.existsSync(fromSecret)
      ? fromSecret
      : { missing: `${FIREBASE_FILE_ENV} points at "${fromSecret}", which does not exist` };
  }
  return fs.existsSync(path.join(__dirname, 'google-services.json'))
    ? './google-services.json'
    : null;
}

module.exports = ({ config }) => {
  // The static config arrives wrapped in `{ expo }` for app.json projects and bare otherwise.
  const base = config?.expo ?? config ?? {};
  const firebaseFile = resolveFirebaseFile();
  const withBase = (changes) => {
    const next = { ...base, ...changes };
    return config?.expo ? { ...config, expo: next } : next;
  };

  if (typeof firebaseFile === 'string') {
    console.log(
      '[app.config] google-services.json found - Firebase enabled (ANDROID_IMPLEMENTATION_PLAN.md A16)'
    );
    return withBase({
      plugins: [...(base.plugins ?? []), FIREBASE_PLUGIN],
      android: { ...base.android, googleServicesFile: firebaseFile },
      // Read at runtime by src/lib/firebase.ts. Means only "this binary was prebuilt with Firebase
      // native config", never "the network works" - every Firebase call site still needs a fallback.
      extra: { ...base.extra, firebaseConfigured: true },
    });
  }

  const reason =
    firebaseFile?.missing ?? 'google-services.json not found';
  console.log(
    `[app.config] ${reason} - building without Firebase (ANDROID_IMPLEMENTATION_PLAN.md A3/A16)`
  );
  return withBase({ extra: { ...base.extra, firebaseConfigured: false } });
};
