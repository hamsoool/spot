import { AppState } from "react-native";
import { useCallback, useEffect, useState } from "react";

import {
  isFirewallAvailable,
  VpnFirewall,
  type NotificationPermissionState,
} from "@/native/VpnFirewall";

/** `null` = not read from the system yet, which is not the same as "missing". */
export type ConsentStatus = "granted" | "missing" | null;

/**
 * Stage 4 consent state machine, kept out of any screen so Stage 5's onboarding
 * and the dev harness drive the same source of truth.
 *
 * Two rules the callers must not re-litigate:
 *  1. Every value is re-read from the system, never assumed. VPN consent can be
 *     revoked by the system key icon, Usage Access can be toggled off in
 *     Settings while we sleep, and Android hides notifications without telling
 *     us — so nothing here caches an answer across a resume.
 *  2. The gates are not equally hard. Without VPN consent the service cannot run
 *     at all; without Usage Access it runs with a static bypass set (Stage 3's
 *     degradation), so "skip for now" is allowed but the dynamic behaviour is
 *     reported as unavailable instead of silently missing.
 */
export function useFirewallPermissions() {
  const [vpnConsent, setVpnConsent] = useState<ConsentStatus>(null);
  const [usageAccess, setUsageAccess] = useState<ConsentStatus>(null);
  const [notifications, setNotifications] =
    useState<NotificationPermissionState | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback((): Promise<void> => {
    // Independent reads: one failing must not blank out the other two, so each settles on
    // its own. A failed read stays `null` ("unknown") — but when all three fail there is
    // no bridge at all (Expo Go, a build without the module), and that has to be reported
    // instead of rendering as three unknowns forever.
    const failures: string[] = [];
    const swallow = (e: unknown): null => {
      failures.push(e instanceof Error ? e.message : String(e));
      return null;
    };
    return Promise.all([
      VpnFirewall.isVpnPrepared().catch(swallow),
      VpnFirewall.hasUsageAccessPermission().catch(swallow),
      VpnFirewall.getNotificationPermission().catch(swallow),
    ]).then(([prepared, usage, notification]) => {
      // State updates live in the .then callback, not after an await, so the mount effect
      // that calls this stays a plain subscription-style read.
      setVpnConsent(
        prepared === null ? null : prepared ? "granted" : "missing",
      );
      setUsageAccess(usage === null ? null : usage ? "granted" : "missing");
      setNotifications(notification);
      if (failures.length === 3) setLastError(failures[0]);
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Acceptance criterion: revoking Usage Access in Settings while the app is
  // asleep must show up as "missing" on return, not stay green.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  /** Throws when the user turns the system VPN dialog down. */
  const requestVpnConsent = useCallback(async (): Promise<void> => {
    setLastError(null);
    try {
      await VpnFirewall.prepareVpn();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      // Whatever happened, the truth comes from the system.
      await refresh();
    }
  }, [refresh]);

  /** Usage Access has no dialog: this opens Settings and leaves the answer to
   *  the resume re-check. Throws only when the skin has no such screen. */
  const requestUsageAccess = useCallback(async (): Promise<void> => {
    setLastError(null);
    try {
      await VpnFirewall.openUsageAccessSettings();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  /**
   * Asks Android for notification permission. Never throws for a plain "denied"
   * — Android reports that through the state, not the promise. A reject means
   * there is no dialog to show (Android ≤12, or the request was refused), which
   * is the caller's cue to offer {@link openAppSettings}.
   */
  const requestNotifications = useCallback(async (): Promise<boolean> => {
    setLastError(null);
    try {
      await VpnFirewall.requestNotificationPermission();
      return true;
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, []);

  const openAppSettings = useCallback(async (): Promise<void> => {
    setLastError(null);
    try {
      await VpnFirewall.openAppSettings();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  const notificationsOk =
    notifications === "granted" || notifications === "not_required";

  return {
    /** False in Expo Go / a build without the module: firewall UI has nothing to drive. */
    firewallAvailable: isFirewallAvailable(),
    vpnConsent,
    usageAccess,
    notifications,
    /**
     * True until the first read lands. The UI must show a neutral "checking" state here —
     * not a permission prompt, and not a green tick.
     */
    isPendingFirstRead:
      vpnConsent === null && usageAccess === null && notifications === null,
    /** Notifications visible without asking (Android ≤12) — hide the prompt. */
    notificationsAreSettled: notificationsOk,
    /** The firewall cannot run at all until this is granted. */
    canRunFirewall: vpnConsent === "granted",
    /** Foreground-following bypass; false = static allow-list only. */
    canFollowForegroundApp: usageAccess === "granted",
    /**
     * The next step the user should take, in the plan's mandated order. Reports `null`
     * while a gate is still unknown, because "we have not read it yet" is not something the
     * user can act on — offering "Ask Android" before the read lands is a lie about state.
     */
    nextMissingGate:
      vpnConsent === "missing"
        ? ("vpnConsent" as const)
        : usageAccess === "missing"
          ? ("usageAccess" as const)
          : null,
    lastError,
    refresh,
    requestVpnConsent,
    requestUsageAccess,
    requestNotifications,
    openAppSettings,
  };
}
