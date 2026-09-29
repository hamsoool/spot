import React, { useEffect, useState } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { SpotSplash } from '@/components/spot-splash';
import { hasCompletedOnboarding } from '@/services/onboarding-state';

/** Minimum time the branded splash stays up; storage read races BOOT_TIMEOUT_MS. */
const MIN_SPLASH_MS = 1400;
const BOOT_TIMEOUT_MS = 3000;

type Phase = 'splash' | 'onboarding' | 'ready';

/**
 * First-launch gate rendered inside the root layout, above the tab shell:
 * branded splash → (first run only) onboarding → the app. Later launches
 * skip straight from splash to the app once the completion flag is read.
 */
export function AppGate() {
  const [phase, setPhase] = useState<Phase>('splash');

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), BOOT_TIMEOUT_MS),
    );
    const read = hasCompletedOnboarding().catch(() => false);

    void Promise.race([read, timeout]).then((completed) => {
      if (cancelled) return;
      const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - startedAt));
      setTimeout(() => {
        if (!cancelled) setPhase(completed === true ? 'ready' : 'onboarding');
      }, wait);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {phase === 'splash' && (
        <Animated.View key="splash" exiting={FadeOut.duration(280)}>
          <SpotSplash />
        </Animated.View>
      )}
      {phase === 'onboarding' && (
        <Animated.View
          key="onboarding"
          entering={FadeIn.duration(320)}
          exiting={FadeOut.duration(280)}>
          <OnboardingScreen onDone={() => setPhase('ready')} />
        </Animated.View>
      )}
    </>
  );
}
