/**
 * Stage 8 — anonymous Firebase Auth.
 *
 * §Stage 8 pins anonymous-only ("do not introduce email/password flows unless asked"), so this
 * provider has exactly one job: turn a cold install into a uid as quietly as possible. It also has
 * to be a no-op when the build carries no Firebase config (A16) — `enabled` is false, no native
 * call is attempted, and the app behaves exactly as it did before Stage 8.
 *
 * Failure is expected and tolerated: a project with Anonymous sign-in not yet enabled in the
 * console yields `auth/operation-not-allowed`, which lands here as status 'error'. Nothing
 * downstream may assume a uid exists.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { signInAnonymously } from '@react-native-firebase/auth';
import { firebaseAuth, firebaseConfigured } from '@/lib/firebase';

export type FirebaseStatus = 'disabled' | 'signing-in' | 'signed-in' | 'error';

export interface FirebaseContextType {
  /** True only when this binary was built with a real google-services.json. */
  enabled: boolean;
  status: FirebaseStatus;
  uid: string | null;
  error: string | null;
  /** Re-attempt the anonymous sign-in (e.g. after enabling it in the Firebase console). */
  retry: () => void;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<FirebaseStatus>(firebaseConfigured ? 'signing-in' : 'disabled');
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setStatus(firebaseConfigured ? 'signing-in' : 'disabled');
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) return;

    let cancelled = false;
    const run = async () => {
      const auth = firebaseAuth();
      if (!auth) {
        if (!cancelled) {
          setError('Firebase native module unavailable');
          setStatus('error');
        }
        return;
      }
      try {
        // Native persistence keeps the anonymous user across restarts, so most launches take
        // this branch and never reach the network.
        const existing = auth.currentUser;
        if (existing) {
          if (!cancelled) {
            setUid(existing.uid);
            setStatus('signed-in');
          }
          return;
        }
        const credential = await signInAnonymously(auth);
        if (!cancelled) {
          setUid(credential.user.uid);
          setStatus('signed-in');
        }
      } catch (e) {
        console.warn('[firebase] anonymous sign-in failed:', e);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus('error');
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const value = useMemo(
    () => ({ enabled: firebaseConfigured, status, uid, error, retry }),
    [status, uid, error, retry],
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
