import { AppState } from "react-native";
import { useCallback, useEffect, useState } from "react";

import {
  isFirewallAvailable,
  VpnFirewall,
  type BatteryOptimizationStatus,
} from "@/native/VpnFirewall";

/**
 * Stage 6: OEM battery-manager state, kept out of the screen so any caller reads
 * the same truth.
 *
 * Both answers here are granted in *Settings*, never in a dialog we own, so the
 * only reliable moment to re-read them is the resume after the user comes back —
 * same rule as `useFirewallPermissions`, for the same reason.
 */
export function useBatteryOptimization() {
  const [status, setStatus] = useState<BatteryOptimizationStatus | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // setState lives inside the promise callbacks, never in the effect body: the
  // react-hooks rule flags a synchronously-called function that sets state (the same
  // shape use-firewall-permissions.ts uses, for the same reason).
  const refresh = useCallback((): Promise<void> => {
    if (!isFirewallAvailable()) return Promise.resolve();
    return VpnFirewall.getBatteryOptimizationStatus()
      .then((next) => {
        setStatus(next);
        setLastError(null);
      })
      .catch((e: unknown) => {
        setLastError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  /**
   * Resolves whether the direct exemption dialog opened (`false` = the device
   * showed the plain optimization list instead), or `null` when the attempt
   * failed. Callers must not promise the user a specific screen without checking.
   */
  const requestExemption = useCallback(async (): Promise<boolean | null> => {
    setLastError(null);
    try {
      return await VpnFirewall.requestIgnoreBatteryOptimizations();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  /** Resolves the screen that opened, or `null` when this device has none. */
  const openAutostart = useCallback(async (): Promise<string | null> => {
    setLastError(null);
    try {
      return await VpnFirewall.openAutostartSettings();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  return {
    /** False in Expo Go / a build without the module. */
    batteryStatusAvailable: isFirewallAvailable(),
    status,
    lastError,
    refresh,
    requestExemption,
    openAutostart,
  };
}
