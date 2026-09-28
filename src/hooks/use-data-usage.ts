import { AppState } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  isFirewallAvailable,
  vpnEvents,
  VpnFirewall,
  type DataUsageSnapshot,
  type DataUsageWindow,
} from "@/native/VpnFirewall";

/**
 * Stage 7: real per-app data usage for the dashboard.
 *
 * Cost is real — one binder round-trip per candidate uid — so this does not poll
 * on a short interval: it reads on mount, on every return to the foreground, on
 * demand, and patches the one number native pushes at it (`statsUpdated`) between
 * reads. Both numbers have to be trustworthy, not merely fresh:
 *
 *  * `mobileBytes` is what the OS reports for the whole device;
 *  * `droppedBytes` is our own sinkhole counter, i.e. bytes that never reached the
 *    radio. It is the only figure the UI may label "saved".
 */
export function useDataUsage(options: {
  /** Extra packages worth measuring: the allow-list and the foreground app. */
  packages: string[];
  window?: DataUsageWindow;
  pollMs?: number;
}) {
  const { packages, window: usageWindow = "today", pollMs = 60_000 } = options;
  const [snapshot, setSnapshot] = useState<DataUsageSnapshot | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // A ref, not a dependency: the caller rebuilds this array every render, and
  // depending on it would restart the polling effect on each one.
  const packagesRef = useRef(packages);
  useEffect(() => {
    packagesRef.current = packages;
  }, [packages]);

  // Every setState sits inside a promise callback, never in the effect body: the
  // react-hooks rule flags a synchronously-invoked function that sets state, which
  // would otherwise fire on the mount effect below (and on every AppState resume).
  const refresh = useCallback((): Promise<void> => {
    if (!isFirewallAvailable()) return Promise.resolve();
    return Promise.resolve()
      .then(() => {
        setIsRefreshing(true);
        return VpnFirewall.getDataUsage(usageWindow, packagesRef.current);
      })
      .then((next) => {
        setSnapshot(next);
        setLastError(null);
      })
      .catch((e: unknown) => {
        setLastError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [usageWindow]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // Native pushes the dropped-byte total while the tunnel is busy; merging it here
  // keeps the headline number live without paying for a full per-uid re-read.
  useEffect(() => {
    const subscription = vpnEvents.addListener((event) => {
      if (event.type !== "statsUpdated") return;
      setSnapshot((current) =>
        current ? { ...current, droppedBytes: event.payload.droppedBytes } : current,
      );
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (pollMs <= 0) return;
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [pollMs, refresh]);

  return {
    /** False in Expo Go / a build without the module. */
    dataUsageAvailable: isFirewallAvailable(),
    snapshot,
    /** True until the first read lands — render "checking", not "zero". */
    isLoading: snapshot === null && lastError === null,
    isRefreshing,
    lastError,
    refresh,
  };
}
