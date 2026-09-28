import { NativeModule, requireOptionalNativeModule } from "expo";
import type { EventSubscription } from "expo-modules-core";

export interface AppInfo {
  packageName: string;
  label: string;
}

/** Emitted whenever the foreground app settles (null = launcher / nothing). */
export interface ForegroundAppPayload {
  packageName: string | null;
  label: string | null;
}

/**
 * Partial state pushed from native. `running: false` always carries an `error`
 * explaining why the tunnel is gone; `watching` reports whether Usage Access is
 * currently granted (false = the firewall is static, foreground app ignored).
 */
export interface StateChangedPayload {
  running?: boolean;
  watching?: boolean;
  error?: string;
}

export interface StatsUpdatedPayload {
  /** Bytes the sinkhole discarded since local midnight. */
  droppedBytes: number;
  /** Local midnight the figure starts from, so the UI can label it. */
  windowStart: number;
}

export type VpnFirewallEvent =
  | { type: "stateChanged"; payload: StateChangedPayload }
  | { type: "statsUpdated"; payload: StatsUpdatedPayload }
  | { type: "foregroundAppChanged"; payload: ForegroundAppPayload };

/**
 * Whether the firewall's persistent notification is actually allowed to appear,
 * read from the system rather than remembered from a dialog callback.
 *  - `granted`            notifications will show
 *  - `not_required`       Android 12 and older: no runtime prompt exists, and
 *                         the app-level toggle is on
 *  - `not_asked`          never prompted; asking will still show the dialog
 *  - `denied`             refused once; asking again shows the dialog
 *  - `permanently_denied` Android refuses to ask again — only Settings helps
 */
export type NotificationPermissionState =
  "granted" | "not_required" | "not_asked" | "denied" | "permanently_denied";

/** Stage 6: what this device is, and which battery screens it actually exposes. */
export interface BatteryOptimizationStatus {
  /** Normalized manufacturer we have guidance for (e.g. "xiaomi"), else null. */
  vendor: string | null;
  manufacturer: string;
  brand: string;
  model: string;
  sdkInt: number;
  /** True when this vendor is known to kill background services aggressively. */
  aggressiveVendor: boolean;
  /** Whether the app is already exempt from Doze / App Standby. */
  ignoringBatteryOptimizations: boolean;
  /** Whether a vendor autostart screen was found and can be opened. */
  autostartAvailable: boolean;
  /** The screen that would open, for support/debugging. Null when none exists. */
  autostartScreen: string | null;
}

export type DataUsageWindow = "today" | "week";

export interface AppUsageEntry {
  packageName: string;
  label: string | null;
  /** Mobile bytes (rx+tx) the OS attributes to this app over the window. */
  bytes: number;
  /**
   * Milliseconds this app spent captured by the tunnel (i.e. blocked) in the window.
   * `null` means "never seen in the bypass set, so unknown" — deliberately not 0,
   * because the OS can say how many bytes an app used but never why it used none.
   */
  blockedMillis: number | null;
}

export interface DataUsageSnapshot {
  window: DataUsageWindow;
  windowStart: number;
  windowEnd: number;
  /** False means every number below is empty because Usage Access is missing. */
  hasUsageAccess: boolean;
  /** Whether the tunnel is up right now. */
  running: boolean;
  /** Device-wide mobile bytes over the window; null when the OS refused to answer. */
  mobileBytes: number | null;
  /**
   * Bytes the sinkhole discarded over the window. Our own counter, and the only
   * honest "saved" figure: every byte counted never reached the radio.
   */
  droppedBytes: number;
  apps: AppUsageEntry[];
}

type VpnFirewallModuleEvents = {
  VpnFirewallEvents: (event: VpnFirewallEvent) => void;
};

declare class VpnFirewallNativeModule extends NativeModule<VpnFirewallModuleEvents> {
  isVpnPrepared(): Promise<boolean>;
  prepareVpn(): Promise<boolean>;
  startFirewall(alwaysAllowed: string[]): Promise<void>;
  stopFirewall(): Promise<void>;
  getInstalledApps(): Promise<AppInfo[]>;
  hasUsageAccessPermission(): Promise<boolean>;
  openUsageAccessSettings(): Promise<void>;
  getNotificationPermission(): Promise<NotificationPermissionState>;
  requestNotificationPermission(): Promise<void>;
  openAppSettings(): Promise<void>;
  getBatteryOptimizationStatus(): Promise<BatteryOptimizationStatus>;
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
  openAutostartSettings(): Promise<string | null>;
  getDataUsage(
    window: DataUsageWindow,
    packages: string[],
  ): Promise<DataUsageSnapshot>;
}

// Resolved optionally on purpose: requireNativeModule THROWS when the module is
// absent (node_modules/expo-modules-core/src/requireNativeModule.ts), and that throw
// happens while the importing module is evaluated — so a single import of this file in
// a real screen would take the whole bundle down under Expo Go or in a browser render.
// The module exists only in a dev client / release build.
const NativeVpnFirewall =
  requireOptionalNativeModule<VpnFirewallNativeModule>("VpnFirewallModule");

/**
 * Whether the firewall is compiled into this build. False under Expo Go and on web.
 * Callers that offer firewall UI must branch on this instead of assuming it, because
 * every method below rejects with {@link unavailable} while it is false.
 */
export function isFirewallAvailable(): boolean {
  return NativeVpnFirewall != null;
}

function unavailable(): Error {
  return new Error(
    "VpnFirewallModule is not part of this build — it exists only in a dev client or " +
      "release build. Rebuild and relaunch to control the firewall.",
  );
}

/** One choke point so a missing module surfaces as a rejection, never a throw. */
async function withModule<T>(
  run: (native: VpnFirewallNativeModule) => Promise<T>,
): Promise<T> {
  if (NativeVpnFirewall == null) throw unavailable();
  return run(NativeVpnFirewall);
}

/**
 * `prepareVpn` settles from an activity result. If the activity dies while the system
 * dialog is up (swiped away from recents, OEM memory pressure), Android never delivers
 * that result and the native listener holds the promise open forever — which strands the
 * UI on "requesting" with no way back. The deadline converts that dead end into a retryable
 * error; the real answer still arrives from {@link VpnFirewall.isVpnPrepared} on resume.
 */
const CONSENT_DEADLINE_MS = 120_000;

async function withDeadline<T>(
  promise: Promise<T>,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(message)),
          CONSENT_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const vpnEvents = {
  /**
   * Returns a no-op subscription while the module is absent, so screens can subscribe
   * unconditionally instead of re-deriving availability at every call site.
   */
  addListener: (
    listener: (event: VpnFirewallEvent) => void,
  ): EventSubscription =>
    NativeVpnFirewall?.addListener("VpnFirewallEvents", listener) ?? {
      remove: () => {},
    },
};

export const VpnFirewall = {
  /** See {@link isFirewallAvailable}; false means every call here rejects. */
  isAvailable: isFirewallAvailable,
  isVpnPrepared: (): Promise<boolean> => withModule((n) => n.isVpnPrepared()),
  /**
   * Resolves true once the system consent dialog has been accepted, or immediately when it
   * already was. Rejects `VPN_DENIED` on a turn-down, and times out if the activity dies
   * before Android can return the result — see {@link withDeadline}.
   */
  prepareVpn: (): Promise<boolean> =>
    withDeadline(
      withModule((n) => n.prepareVpn()),
      "Android did not return the VPN consent result in time. Check the consent state and try again.",
    ),
  /**
   * `alwaysAllowed` lists apps that keep their own connection regardless of
   * what Stage 7's rules decide. The native side unions it with the current
   * foreground app and this app's own package, then hands that set to
   * VpnService.Builder.addDisallowedApplication() — which is what "excluded from
   * the tunnel, therefore still working" means on Android. Everything not in
   * the set is captured and sinkholed.
   *
   * Rejects `VPN_NOT_PREPARED` when the system consent dialog hasn't been
   * accepted (so the UI can run the consent step first instead of watching the
   * tunnel die), and `FGS_START_NOT_ALLOWED` when Android refuses a foreground
   * service start because the app is in the background.
   */
  startFirewall: (alwaysAllowed: string[]): Promise<void> =>
    withModule((n) => n.startFirewall(alwaysAllowed)),
  stopFirewall: (): Promise<void> => withModule((n) => n.stopFirewall()),
  getInstalledApps: (): Promise<AppInfo[]> =>
    withModule((n) => n.getInstalledApps()),
  /** Usage Access is "special access": no runtime dialog exists, so this only
   *  reports the app-op state the user set in Settings. */
  hasUsageAccessPermission: (): Promise<boolean> =>
    withModule((n) => n.hasUsageAccessPermission()),
  /** Rejects with USAGE_SETTINGS_UNAVAILABLE on skins exposing no such screen. */
  openUsageAccessSettings: (): Promise<void> =>
    withModule((n) => n.openUsageAccessSettings()),
  /** The authoritative answer to "will the firewall's notification show?". */
  getNotificationPermission: (): Promise<NotificationPermissionState> =>
    withModule((n) => n.getNotificationPermission()),
  /**
   * Shows the POST_NOTIFICATIONS dialog and resolves once it has been handed to
   * Android — the user's answer is NOT the resolved value, and on Android 12 and
   * older this rejects with `NO_RUNTIME_DIALOG`. Re-read
   * {@link VpnFirewall.getNotificationPermission} after the app resumes;
   * `useFirewallPermissions` already does that.
   */
  requestNotificationPermission: (): Promise<void> =>
    withModule((n) => n.requestNotificationPermission()),
  /** Escape hatch for every permanently-denied permission: our app's Settings
   *  page. Rejects `APP_SETTINGS_UNAVAILABLE` if the skin has none. */
  openAppSettings: (): Promise<void> => withModule((n) => n.openAppSettings()),
  /** Stage 6 facts for the "keep the firewall alive" card. Re-read on resume, since
   *  the user grants the exemption in Settings rather than in a dialog we own. */
  getBatteryOptimizationStatus: (): Promise<BatteryOptimizationStatus> =>
    withModule((n) => n.getBatteryOptimizationStatus()),
  /**
   * Opens the Doze / App Standby exemption prompt. Resolves `true` for the direct
   * dialog and `false` when the device had to fall back to the plain list screen —
   * the UI has to say different things about those two outcomes.
   */
  requestIgnoreBatteryOptimizations: (): Promise<boolean> =>
    withModule((n) => n.requestIgnoreBatteryOptimizations()),
  /**
   * Opens the vendor autostart screen (MIUI, ColorOS, FuntouchOS, …) and resolves the
   * screen it opened. Resolves `null` when this device exposes none, which is a normal
   * answer — show written instructions rather than a dead button.
   */
  openAutostartSettings: (): Promise<string | null> =>
    withModule((n) => n.openAutostartSettings()),
  /**
   * Stage 7. `packages` are extra candidates to measure (the allow-list and the
   * current foreground app are the useful ones). Rejects without Usage Access is not
   * how this fails — it resolves with `hasUsageAccess: false` and empty numbers, so a
   * dashboard can render the reason instead of an error.
   */
  getDataUsage: (
    window: DataUsageWindow,
    packages: string[] = [],
  ): Promise<DataUsageSnapshot> =>
    withModule((n) => n.getDataUsage(window, packages)),
};
