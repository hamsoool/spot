import { useEffect, useState } from 'react';
import { AccessibilityInfo, type NativeEventSubscription } from 'react-native';

/**
 * Whether the OS "Reduce Motion" setting is on. Entrance and ambient
 * animations in the splash and onboarding flows resolve instantly when true.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value: boolean) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {});
    let subscription: NativeEventSubscription | undefined;
    try {
      subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) =>
        setReduced(value),
      );
    } catch {
      subscription = undefined;
    }
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  return reduced;
}
