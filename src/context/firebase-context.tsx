/**
 * Firebase Auth identity.
 *
 * Anonymous sign-in stays the quiet default (no Firebase in the build, no
 * network, or a failed attempt all degrade the same way). On top of that
 * this provider owns the user-visible identity surface:
 *
 *  - Email sign-in / registration, with automatic anonymous-upgrade: when the
 *    current Firebase user is anonymous it is *linked* (linkWithCredential)
 *    instead of replaced, so the `users/{uid}` settings document survives.
 *  - Google sign-in via the native google-signin bridge (service file), with
 *    the same link-first behavior.
 *  - Sign-out back to a fresh anonymous identity; the user record never goes
 *    null, so SettingsSync's uid-keyed hydration keeps a stable document path.
 *
 * Nothing here throws to the tree: every entry point reports through
 * `authBusy` / `authError`, cleared on success or on the next attempt.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from '@react-native-firebase/auth';
import { firebaseAuth, firebaseConfigured } from '@/lib/firebase';
import { authErrorMessage } from '@/services/auth-errors';
import { GOOGLE_WEB_CLIENT_ID, loadGoogleSignin } from '@/services/google-signin';

export type FirebaseStatus = 'disabled' | 'signing-in' | 'signed-in' | 'error';

export type AuthProviderId = 'password' | 'google.com';

export interface FirebaseUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  /** True for the pre-login placeholder — never shown as "signed in". */
  isAnonymous: boolean;
  providers: AuthProviderId[];
}

export interface FirebaseContextType {
  /** True only when this binary was built with a real google-services.json. */
  enabled: boolean;
  status: FirebaseStatus;
  uid: string | null;
  user: FirebaseUserInfo | null;
  /** Non-anonymous login: email or Google credential linked. */
  isLoggedIn: boolean;
  error: string | null;
  authBusy: boolean;
  authError: string | null;
  /** Re-attempt the anonymous sign-in (e.g. after enabling it in the Firebase console). */
  retry: () => void;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  registerWithEmail: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signOutToAnonymous: () => Promise<boolean>;
  clearAuthError: () => void;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

function projectUser(firebaseUser: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  isAnonymous?: boolean;
  providerData?: { providerId?: string }[];
}): FirebaseUserInfo {
  const providers = (firebaseUser.providerData ?? [])
    .map((p) => p.providerId)
    .filter((id): id is AuthProviderId => id === 'password' || id === 'google.com');
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? null,
    displayName: firebaseUser.displayName ?? null,
    isAnonymous: firebaseUser.isAnonymous ?? providers.length === 0,
    providers,
  };
}

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<FirebaseStatus>(firebaseConfigured ? 'signing-in' : 'disabled');
  const [user, setUser] = useState<FirebaseUserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setStatus(firebaseConfigured ? 'signing-in' : 'disabled');
    setAttempt((n) => n + 1);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  useEffect(() => {
    if (!firebaseConfigured) return;

    let cancelled = false;
    const auth = firebaseAuth();
    if (!auth) {
      // Reported from a task, not the effect body: react-hooks/set-state-in-effect
      // rejects a synchronous setState here, and this value never depends on
      // timing — the binary either has the native module or it does not.
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setError('Firebase native module unavailable');
        setStatus('error');
      });
      return () => {
        cancelled = true;
      };
    }

    // First snapshot wins: persistence restores the last user before any
    // network, and the fallback below only runs when there is no user at all.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (cancelled) return;
      if (firebaseUser) {
        setUser(projectUser(firebaseUser));
        setError(null);
        setStatus('signed-in');
      }
    });

    const ensureAnonymous = async () => {
      if (cancelled || auth.currentUser) return;
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.warn('[firebase] anonymous sign-in failed:', e);
        if (!cancelled && !auth.currentUser) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus('error');
        }
      }
    };

    void ensureAnonymous();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [attempt]);

  /**
   * Run an auth mutation under the busy flag, mapping failures to banner
   * copy. Returns true on success; the auth-state listener above publishes
   * the resulting user, so no manual setUser happens here.
   */
  const runAuthAction = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    const auth = firebaseAuth();
    if (!auth) {
      setAuthError('Sign-in is unavailable in this build.');
      return false;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setAuthError(authErrorMessage(e));
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const withAnonymousUpgrade = useCallback(
    async (
      auth: NonNullable<ReturnType<typeof firebaseAuth>>,
      upgrade: (anonymousUser: NonNullable<typeof auth.currentUser>) => Promise<unknown>,
      fresh: () => Promise<unknown>,
    ): Promise<unknown> => {
      const current = auth.currentUser;
      // Link-first: an anonymous placeholder upgrades in place, so the
      // `users/{uid}` settings document never changes path under the sync loop.
      if (current && current.isAnonymous) {
        return upgrade(current);
      }
      return fresh();
    },
    [],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      const normalizedEmail = email.trim();
      return runAuthAction(async () => {
        const auth = firebaseAuth();
        if (!auth) throw new Error('Sign-in is unavailable in this build.');
        return withAnonymousUpgrade(
          auth,
          (anonymousUser) =>
            linkWithCredential(anonymousUser, EmailAuthProvider.credential(normalizedEmail, password)),
          () => signInWithEmailAndPassword(auth, normalizedEmail, password),
        );
      });
    },
    [runAuthAction, withAnonymousUpgrade],
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      const normalizedEmail = email.trim();
      return runAuthAction(async () => {
        const auth = firebaseAuth();
        if (!auth) throw new Error('Sign-in is unavailable in this build.');
        return withAnonymousUpgrade(
          auth,
          (anonymousUser) =>
            linkWithCredential(
              anonymousUser,
              EmailAuthProvider.credential(normalizedEmail, password),
            ),
          () => createUserWithEmailAndPassword(auth, normalizedEmail, password),
        );
      });
    },
    [runAuthAction, withAnonymousUpgrade],
  );

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    const { api: bridge, reason } = await loadGoogleSignin();
    if (!bridge) {
      setAuthError(
        reason === 'web'
          ? 'Google sign-in is not supported on web yet — use email instead.'
          : 'Google sign-in needs an app update with the new native module. Please rebuild and try again.',
      );
      return false;
    }
    return runAuthAction(async () => {
      const auth = firebaseAuth();
      if (!auth) throw new Error('Sign-in is unavailable in this build.');
      bridge.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: false });
      await bridge.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await bridge.signIn();
      const idToken = response.data?.idToken ?? response.idToken;
      if (!idToken) throw new Error('Google sign-in returned no credential.');
      const credential = GoogleAuthProvider.credential(idToken);
      try {
        return await withAnonymousUpgrade(
          auth,
          (anonymousUser) => linkWithCredential(anonymousUser, credential),
          () => signInWithCredential(auth, credential),
        );
      } finally {
        await bridge.signOut().catch(() => {});
      }
    });
  }, [runAuthAction, withAnonymousUpgrade]);

  const signOutToAnonymous = useCallback(async (): Promise<boolean> => {
    const auth = firebaseAuth();
    if (!auth) {
      setAuthError('Sign-in is unavailable in this build.');
      return false;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const { api: bridge } = await loadGoogleSignin();
      await bridge?.signOut().catch(() => {});
      await signOut(auth);
      await signInAnonymously(auth);
      return true;
    } catch (e) {
      setAuthError(authErrorMessage(e));
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const value = useMemo<FirebaseContextType>(
    () => ({
      enabled: firebaseConfigured,
      status,
      uid: user?.uid ?? null,
      user,
      isLoggedIn: user !== null && !user.isAnonymous,
      error,
      authBusy,
      authError,
      retry,
      signInWithEmail,
      registerWithEmail,
      signInWithGoogle,
      signOutToAnonymous,
      clearAuthError,
    }),
    [
      status,
      user,
      error,
      authBusy,
      authError,
      retry,
      signInWithEmail,
      registerWithEmail,
      signInWithGoogle,
      signOutToAnonymous,
      clearAuthError,
    ],
  );

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export function useFirebase(): FirebaseContextType {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return ctx;
}
