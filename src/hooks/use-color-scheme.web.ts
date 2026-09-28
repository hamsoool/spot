import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const colorScheme = useRNColorScheme();

  useEffect(() => {
    // Defer to the next frame so the effect never triggers a synchronous
    // cascading render during hydration.
    const frame = requestAnimationFrame(() => setHasHydrated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
