# Mobile Data Optimizer + VPN (Android) — Implementation Plan

**Audience:** This document is written to be executed by an autonomous/agentic coding agent (e.g. Claude Code) working inside this repository. It is a staged build spec, not a tutorial — follow it in order, verify each stage's Definition of Done (DoD) before moving on, and do not skip ahead.

---

## 0. How To Use This Document

1. Work through the **Stages** in Section 6 strictly in order (Stage 0 → Stage 10).
2. Each stage has: **Objective**, **Prerequisites**, **Tasks**, **Files to create/modify**, **Acceptance Criteria (DoD)**.
3. Do not start a stage until the previous stage's DoD checklist is fully satisfied. If a DoD item cannot be verified automatically (e.g. it requires a physical Android device), say so explicitly rather than assuming success.
4. Commit at the end of every stage with a message referencing the stage number (e.g. `feat(stage-3): foreground-app detection loop`).
5. If you discover the spec is wrong, ambiguous, or conflicts with something you find in the Android SDK/RN ecosystem while implementing, **stop and surface the conflict** rather than silently deviating. Log it under "Section 7 — Known Constraints & Design Decisions" as an amendment.
6. Do not attempt to port the per-app firewall feature to iOS. See Section 1.2.

---

## 1. Product Scope

### 1.1 Goals
Build a private (not yet Play Store–published) Android app, front-ended in React Native, that:
- **(A) Data Optimizer:** Restricts mobile data so that, by default, only the app currently in the foreground can send/receive data. Background apps are blocked from silently consuming mobile data unless explicitly whitelisted by the user.
- **(B) Bundled VPN:** Offers an optional VPN tunnel to a server geographically nearest the user (Philippines-first), layered on top of the same underlying interface used for (A).

### 1.2 Explicit Non-Goals (this phase)
- **No iOS work.** Apple restricts per-app traffic routing (Per-App VPN / `NEAppProxyProvider`) to devices enrolled in MDM. A consumer App Store app cannot restrict what other apps on the device do. Do not create an iOS native module for the firewall feature. If the RN project has an `ios/` folder, leave it untouched except for basic app identity (name, icon) until a future phase explicitly re-scopes iOS.
- **No Google Play submission logic yet.** Permissions like `QUERY_ALL_PACKAGES` require a Play Console declaration only if/when this ships publicly. For now the APK is sideloaded, so build without gating features on Play policy — but leave a `// TODO(play-policy)` marker anywhere a future public release would need review (see Stage 10).
- **No production key-management backend for the VPN** in this phase. Stage 9 wires in a VPN protocol client; provisioning real production VPN servers is out of scope for the coding agent and is a separate infra task for the human operator.

### 1.3 Distribution Assumptions
- Private project, sideloaded APK (debug or ad-hoc signed release), single developer/team.
- Target/compile SDK: use the latest stable Android SDK available in the environment (expected Android 14/API 34+) so the implementation is forward-compatible; note the exact versions actually used in `android/build.gradle` once set.

---

## 2. Tech Stack & Dependencies

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React Native (**bare workflow**, or Expo with `expo prebuild` / dev client) | Expo Go **cannot** be used — a custom `VpnService` and a long-lived foreground service require native code that Expo Go's sandbox does not allow. |
| Native language (Android) | Kotlin | All native modules/services in this plan are specified in Kotlin. |
| Backend / accounts | Firebase Auth + Cloud Firestore | Used for user accounts and syncing per-device settings (allow-lists, always-allowed apps, VPN preference). Not used for VPN packet transport. |
| VPN protocol (Stage 9) | WireGuard (preferred) or Outline/Shadowsocks | Decide in Stage 9 based on server-side infra the human operator sets up. Do not hard-code a choice earlier than Stage 9. |

Add once scaffolding exists (Stage 0):
```bash
npm install @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore
```

---

## 3. Architecture Overview

### 3.1 Core Insight — How The Firewall Actually Works

This is the single most important technical fact in this spec. Get it right or the whole feature is backwards.

`android.net.VpnService.Builder` exposes two **mutually exclusive** methods:
- `addAllowedApplication(pkg)` — if called at least once, **only** listed apps' traffic is captured into your VPN/TUN interface; every other app bypasses the VPN entirely and uses the network normally.
- `addDisallowedApplication(pkg)` — the listed apps' traffic **bypasses** your VPN/TUN interface and uses the network exactly as if your VPN weren't running; every other (non-listed) app's traffic is captured into your TUN interface.

Calling both methods on the same `Builder` throws `UnsupportedOperationException` — you must pick one mode.

**For this app, use `addDisallowedApplication()`**, not `addAllowedApplication()`. Reasoning:
- We want the **currently foreground app** (plus a small always-allowed set) to have completely normal, untouched, zero-overhead network access → put it/them in the **disallowed** list (i.e., disallowed from the VPN, meaning allowed to use the network directly).
- We want **every other app** to have its traffic captured into our TUN interface, where — in firewall/sinkhole mode — we simply never forward it anywhere (we read the TUN's `FileInputStream` and drop what we read, or don't even bother reading, since nothing is reading the other end either). The captured app's sockets will time out / fail to connect, which is the intended "blocked" behavior.
- This means the MVP firewall does **not** need a TCP/IP stack, NAT, or packet parsing — captured traffic is simply never relayed. This is a deliberate simplification versus general-purpose firewalls (like NetGuard) that need finer-grained IP/port rules; we only need a binary foreground/not-foreground gate.
- When Stage 9 adds the real VPN tunnel, the *only* thing that changes is what happens to captured packets: instead of being dropped, they get relayed to the remote VPN server. The allow/disallow logic is unchanged.

**Dynamic updates:** `VpnService.Builder` configuration is fixed once `establish()` is called — you cannot hot-swap the disallowed-app set on a live TUN interface. Changing which app is "currently allowed" (foreground app changes) requires closing the current interface and calling `establish()` again with a new `Builder`. This causes a brief (sub-second, target) interruption for the app that just lost/gained foreground status. Design for this — don't treat it as a bug to "fix" by avoiding re-establish, since the platform doesn't support incremental updates.

**Always-allowed set:** Beyond the dynamic foreground app, maintain a small fixed disallow-list of apps that should never be blocked, at minimum:
- This app's own package (so it can keep syncing Firebase / showing UI).
- `com.google.android.gms` (Google Play Services) — blocking this breaks **push notifications for every app on the device**, which is almost certainly not what a user wants from a "data saver," even though it superficially saves data. Flag this trade-off to the user in onboarding copy; consider making it a togglable "aggressive mode" rather than the default.
- The user's default dialer and SMS app (fetch via `RoleManager` or `TelephonyManager`/`Telecom` defaults) — blocking these could affect emergency-adjacent functionality.
- Anything the user manually whitelists in Settings.

### 3.2 Component Diagram (textual)

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│   React Native JS layer     │        │        Android (Kotlin)          │
│                              │        │                                  │
│  UI: app list, toggles,     │◄──────►│  VpnFirewallModule                │
│  usage dashboard             │  RN    │  (ReactContextBaseJavaModule)     │
│                              │ Bridge │        │                          │
│  NativeEventEmitter listener │◄───────┤        ▼                          │
│  (connection state, stats)   │        │  VpnFirewallService (VpnService)  │
└─────────────────────────────┘        │        │                          │
                                        │        ├─ Builder.establish()     │
        ┌───────────────────┐          │        ├─ ForegroundAppWatcher    │
        │ Firebase Firestore│◄─────────┤        │  (UsageStatsManager)     │
        │ (settings sync)   │          │        ├─ StatsReader             │
        └───────────────────┘          │        │  (NetworkStatsManager)   │
                                        │        └─ (Stage 9) TunnelClient  │
                                        └──────────────────────────────────┘
```

### 3.3 Data Flow (steady state, firewall-only mode)
1. `ForegroundAppWatcher` polls `UsageStatsManager` on an interval (see Stage 3) to detect the current foreground package.
2. On change, it notifies `VpnFirewallService`, which tears down and re-establishes the TUN interface with an updated `addDisallowedApplication()` set (new foreground app + always-allowed set).
3. Apps not in the disallowed set have their traffic captured into the TUN and dropped.
4. `VpnFirewallService` emits state changes (connected/disconnected, current allowed app, basic stats) to `VpnFirewallModule`, which relays them to JS via `NativeEventEmitter`.
5. Settings (always-allowed list, feature on/off, VPN preference) are read from/written to Firestore, cached locally for offline use.

---

## 4. Repository Layout (target)

```
android/
  app/
    src/main/
      AndroidManifest.xml
      java/com/<pkg>/
        MainApplication.kt
        vpn/
          VpnFirewallService.kt
          VpnFirewallModule.kt
          VpnFirewallPackage.kt
          ForegroundAppWatcher.kt
          NetworkStatsReader.kt
          AlwaysAllowedApps.kt
          OemBatteryHelper.kt
        tunnel/                     # Stage 9
          TunnelClient.kt           # interface
          WireGuardTunnelClient.kt  # or Outline/XRay impl
src/
  native/
    VpnFirewall.ts                 # JS wrapper around the native module
  screens/
    AppAllowListScreen.tsx
    DashboardScreen.tsx
    OnboardingBatteryScreen.tsx
  services/
    firestoreSettings.ts
  state/
    vpnStore.ts                     # whatever state manager the project already uses
ANDROID_IMPLEMENTATION_PLAN.md      # this file
```

---

## 5. Global Conventions
- Native package root: `com.<company>.<appname>.vpn` — substitute the real application ID once known; do not invent a placeholder that later requires a mass find/replace without flagging it.
- All native-to-JS events go through a single emitter name, e.g. `VpnFirewallEvents`, with a `type` field per payload (`"stateChanged" | "statsUpdated" | "foregroundAppChanged"`) rather than multiple emitter channels.
- All long-running native work (TUN read loop, `UsageStatsManager` polling) runs on a dedicated background thread/coroutine — never on the main thread.
- Every permission request has a corresponding rationale screen/string shown to the user **before** the system prompt (for runtime permissions) or before deep-linking to a Settings page (for special permissions with no runtime prompt, like Usage Access).

---

## 6. Stage-by-Stage Implementation

### Stage 0 — Environment & Project Scaffolding

**Objective:** A buildable bare React Native Android project with Firebase wired in, before any VPN-specific code exists.

**Tasks:**
- [ ] Initialize (or convert) the project to bare workflow. If starting from Expo, run `npx expo prebuild` to generate the `android/` folder.
- [ ] Confirm `cd android && ./gradlew assembleDebug` succeeds with zero VPN-related code present. This is your baseline — any later build failure is attributable to what you add.
- [ ] Add Firebase: `@react-native-firebase/app`, `@react-native-firebase/auth`, `@react-native-firebase/firestore`. Add `google-services.json` to `android/app/` (placeholder/instructions if the human hasn't provided a real Firebase project yet — do not fabricate a working config).
- [ ] Set up basic navigation scaffold (whatever the project's existing convention is) with three empty screens: Dashboard, App Allow-List, Settings.

**Acceptance Criteria:**
- [ ] `./gradlew assembleDebug` succeeds.
- [ ] App launches on an emulator/device showing the three empty screens navigable from a tab bar or stack.
- [ ] Firebase initializes without crashing (guard with a clear error if `google-services.json` is a placeholder).

---

### Stage 1 — Native Module Bridge Skeleton (no VPN logic yet)

**Objective:** Prove the JS ↔ Kotlin bridge works end-to-end before any real networking code exists, so later debugging is isolated to actual VPN logic, not plumbing.

**Files to create:**
- `android/app/src/main/java/com/<pkg>/vpn/VpnFirewallModule.kt`
- `android/app/src/main/java/com/<pkg>/vpn/VpnFirewallPackage.kt`
- `src/native/VpnFirewall.ts`

**`VpnFirewallModule.kt` — required methods (stub bodies for this stage):**
```kotlin
class VpnFirewallModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "VpnFirewallModule"

    @ReactMethod
    fun isVpnPrepared(promise: Promise) { /* stub: resolve(false) */ }

    @ReactMethod
    fun prepareVpn(promise: Promise) { /* stub: resolve(true) */ }

    @ReactMethod
    fun startFirewall(alwaysAllowedPackages: ReadableArray, promise: Promise) { /* stub */ }

    @ReactMethod
    fun stopFirewall(promise: Promise) { /* stub */ }

    @ReactMethod
    fun getInstalledApps(promise: Promise) { /* stub: resolve a hardcoded WritableArray */ }

    @ReactMethod
    fun hasUsageAccessPermission(promise: Promise) { /* stub: resolve(false) */ }

    @ReactMethod
    fun openUsageAccessSettings() { /* stub: no-op */ }
}
```

**Register the package** in `VpnFirewallPackage.kt` (standard `ReactPackage` boilerplate) and add it to `MainApplication.kt`'s `getPackages()`.

**JS wrapper (`src/native/VpnFirewall.ts`):**
```ts
import { NativeModules, NativeEventEmitter } from 'react-native';

const { VpnFirewallModule } = NativeModules;
export const vpnEvents = new NativeEventEmitter(VpnFirewallModule);

export const VpnFirewall = {
  isVpnPrepared: (): Promise<boolean> => VpnFirewallModule.isVpnPrepared(),
  prepareVpn: (): Promise<boolean> => VpnFirewallModule.prepareVpn(),
  startFirewall: (alwaysAllowed: string[]): Promise<void> =>
    VpnFirewallModule.startFirewall(alwaysAllowed),
  stopFirewall: (): Promise<void> => VpnFirewallModule.stopFirewall(),
  getInstalledApps: (): Promise<AppInfo[]> => VpnFirewallModule.getInstalledApps(),
  hasUsageAccessPermission: (): Promise<boolean> =>
    VpnFirewallModule.hasUsageAccessPermission(),
  openUsageAccessSettings: (): void => VpnFirewallModule.openUsageAccessSettings(),
};

export type AppInfo = { packageName: string; label: string };
```

**Acceptance Criteria:**
- [ ] From a JS screen, calling `VpnFirewall.getInstalledApps()` resolves with the stub data and renders it in a list — proving the bridge is wired correctly before real logic is added.
- [ ] No native crashes on module load.

---

### Stage 2 — Core VpnService (Local Firewall / Sinkhole Mode)

**Objective:** A real, working local firewall: the foreground app (hardcoded for this stage — dynamic detection comes in Stage 3) gets normal data, everything else is blocked.

**Manifest additions (`AndroidManifest.xml`):**
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />

<application ...>
    <service
        android:name=".vpn.VpnFirewallService"
        android:permission="android.permission.BIND_VPN_SERVICE"
        android:foregroundServiceType="specialUse"
        android:exported="false">
        <property
            android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
            android:value="Per-app mobile data firewall" />
        <intent-filter>
            <action android:name="android.net.VpnService" />
        </intent-filter>
    </service>
</application>
```
> Note: `specialUse` foreground service types require a written justification if this app is ever submitted to Google Play; not required for sideloaded builds. Leave a `// TODO(play-policy)` comment at the manifest entry.

**`VpnFirewallService.kt` — required shape:**
```kotlin
class VpnFirewallService : VpnService() {

    private var tunInterface: ParcelFileDescriptor? = null
    private var readerThread: Thread? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildPersistentNotification())
        val disallowed = intent?.getStringArrayListExtra(EXTRA_DISALLOWED) ?: arrayListOf()
        establishInterface(disallowed)
        return START_STICKY
    }

    private fun establishInterface(disallowedPackages: List<String>) {
        tearDown() // always close any existing interface first — Builder config is immutable once established
        val builder = Builder()
            .setSession("DataOptimizerFirewall")
            .addAddress("10.0.0.2", 32)
            .addRoute("0.0.0.0", 0)
            .addDnsServer("1.1.1.1")
            .setMtu(1500)

        disallowedPackages.forEach { pkg ->
            try {
                builder.addDisallowedApplication(pkg)
            } catch (e: PackageManager.NameNotFoundException) {
                // package not installed / uninstalled since list was built — skip, log, do not crash
            }
        }

        tunInterface = builder.establish()
        startSinkholeReader()
    }

    private fun startSinkholeReader() {
        val fd = tunInterface ?: return
        readerThread = Thread {
            val input = FileInputStream(fd.fileDescriptor)
            val buffer = ByteArray(32767)
            try {
                while (!Thread.currentThread().isInterrupted) {
                    // Intentionally read-and-discard: captured apps' packets are never
                    // forwarded anywhere in firewall-only mode, which is what blocks them.
                    input.read(buffer)
                }
            } catch (e: IOException) {
                // interface torn down — expected during establishInterface() churn
            }
        }.apply { start() }
    }

    fun updateDisallowedApps(disallowedPackages: List<String>) =
        establishInterface(disallowedPackages) // re-establish is the only supported way to change the set

    private fun tearDown() {
        readerThread?.interrupt()
        tunInterface?.close()
        tunInterface = null
    }

    override fun onDestroy() {
        tearDown()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_DISALLOWED = "extra_disallowed_packages"
        const val NOTIFICATION_ID = 1001
    }
}
```

**Wire real logic into `VpnFirewallModule.kt`:**
- `prepareVpn(promise)`: call `VpnService.prepare(context)`. If it returns non-null `Intent`, start it via `startActivityForResult` and resolve based on the result; if null, permission is already granted — resolve `true` immediately.
- `startFirewall(alwaysAllowedPackages, promise)`: start `VpnFirewallService` with an `Intent` carrying the always-allowed set (foreground app comes in Stage 3).
- `getInstalledApps(promise)`: use `PackageManager.getInstalledApplications(PackageManager.GET_META_DATA)`, filter out this app's own package only if you want to force-include it separately, and map to `{ packageName, label }`.

**Acceptance Criteria:**
- [ ] On a real device/emulator: start the firewall with a hardcoded disallowed list containing only the browser's package name and this app's own package. Confirm the browser can load a page, and confirm a different app (e.g. a background sync app) cannot reach the network while the firewall is active.
- [ ] Toggling the firewall off (`stopFirewall`) restores normal connectivity for all apps.
- [ ] No ANR (Application Not Responding) — reader thread must never touch the main thread.

---

### Stage 3 — Foreground-App Detection & Dynamic Allow-list

**Objective:** Replace the hardcoded disallowed package with a live-updating value driven by whatever app the user currently has open.

**Files to create:**
- `android/app/src/main/java/com/<pkg>/vpn/ForegroundAppWatcher.kt`

**Required behavior:**
- Requires the special "Usage Access" permission (`PACKAGE_USAGE_STATS`) — there is **no runtime permission dialog** for this; the user must be sent to `Settings.ACTION_USAGE_ACCESS_SETTINGS` manually. Check `AppOpsManager.checkOpNoThrow(OPSTR_GET_USAGE_STATS, ...)` (or attempt a `UsageStatsManager` query and check for empty results) to detect whether it's already granted.
- Poll `UsageStatsManager.queryUsageStats` (or `queryEvents` for finer granularity) on an interval — start with 1–2 seconds; tune later based on battery impact testing in Stage 10. Prefer `queryEvents` + `MOVE_TO_FOREGROUND`/`MOVE_TO_BACKGROUND` event types over the older "sort UsageStats by lastTimeUsed" trick, since events give a more precise and lower-latency foreground signal.
- On detecting a foreground-app change, debounce briefly (e.g. 300–500ms) before triggering `VpnFirewallService.updateDisallowedApps()`, so rapid app-switching (e.g. flicking through the recents screen) doesn't thrash the TUN interface with rapid re-establishes.
- Emit the current foreground package to JS via the shared event emitter so the UI can show "Currently allowed: <App Name>."

**Acceptance Criteria:**
- [ ] Switching between two test apps updates which one has network access within ~1 second, with no crash.
- [ ] Rapid app-switching (stress test: switch 10 times in 3 seconds) does not crash the service or leave the TUN interface in a broken state — after switching stops, the correct final app has data access.
- [ ] `hasUsageAccessPermission()` correctly reflects whether the user has granted access, and `openUsageAccessSettings()` correctly deep-links to the right settings screen.

---

### Stage 4 — Permissions, Consent & Foreground-Service Compliance

**Objective:** Every permission/consent flow required by Stages 2–3 has a proper rationale + request flow, and the app complies with foreground-service rules for the target SDK.

**Tasks:**
- [ ] **VPN consent:** Before first use, show a rationale screen explaining why the system "Connection request" VPN dialog will appear, then call `prepareVpn()`.
- [ ] **Usage Access:** Rationale screen explaining why the app needs to know the foreground app, then `openUsageAccessSettings()`. On returning to the app (`onResume` / `AppState` listener), re-check `hasUsageAccessPermission()` and reflect the result in UI — don't assume the user granted it just because they went to Settings.
- [ ] **POST_NOTIFICATIONS** (Android 13+/API 33+): request at runtime before starting the foreground service, since the persistent "Firewall active" notification requires it; handle the denied case gracefully (service can still run, but Android may be more aggressive about killing it without a visible notification — surface this trade-off to the user rather than silently degrading).
- [ ] Confirm `startForeground()` is called within the OS-mandated time window after `startForegroundService()`/`startService()` is invoked (a few seconds) — do not do slow setup work (like a network call) before calling `startForeground()`.
- [ ] Double check the exact `foregroundServiceType` and permission strings against the Android version actually targeted once `compileSdkVersion`/`targetSdkVersion` are finalized in Stage 0 — the values in Stage 2 assume a recent SDK (34+) and may need adjustment for an older target.

**Acceptance Criteria:**
- [ ] Fresh install → app clearly walks the user through VPN consent, then Usage Access, in that order, with no dead-ends (a "skip for now" affordance is fine but must clearly gate the feature until granted).
- [ ] Revoking Usage Access mid-session (via Settings, without closing the app) is detected on next `onResume` and the UI reflects "permission needed" rather than silently failing.

---

### Stage 5 — React Native UI Layer

**Objective:** A usable UI for the features built so far.

**Screens:**
- **Dashboard:** firewall on/off toggle, VPN on/off toggle (disabled/hidden until Stage 9), current allowed app, live-ish data usage summary (wired properly in Stage 7; placeholder here is fine).
- **App Allow-List:** list from `getInstalledApps()`, with per-app toggle for "always allow" (merged into the always-allowed set passed to `startFirewall`). Persist locally and sync to Firestore (Stage 8).
- **Onboarding:** the permission rationale screens from Stage 4, plus the OEM battery-manager screen from Stage 6.

**Acceptance Criteria:**
- [ ] A user can, without reading this document, discover and use both the firewall toggle and per-app whitelist from the UI alone.
- [ ] UI reflects real-time state changes pushed from native (firewall connected/disconnected, current foreground app) via the event emitter — not just the state at the moment a screen mounted.

---

### Stage 6 — OEM Battery-Manager Onboarding

**Objective:** Prevent the service from being silently killed on the OEM Android skins that dominate the Philippines market (Xiaomi/Redmi/Poco's MIUI/HyperOS, Oppo/Realme's ColorOS, vivo's FuntouchOS) — all known to aggressively kill background/foreground services unless the user manually whitelists the app.

**Files to create:**
- `android/app/src/main/java/com/<pkg>/vpn/OemBatteryHelper.kt`

**Required behavior:**
- Detect `Build.MANUFACTURER` (normalize case, e.g. `"xiaomi"`, `"oppo"`, `"vivo"`, `"huawei"`, `"samsung"`, `"oneplus"`) and, on relevant manufacturers, show a screen (Stage 5's onboarding flow) with brand-specific instructions and a deep-link intent to the relevant settings screen where possible (exact intents/action strings vary by OEM skin/version and are not always documented — attempt a best-effort `Intent` to the manufacturer's battery/autostart settings activity, and always provide a plain-text fallback instruction set if the intent fails to resolve, rather than crashing).
- Also request exemption from standard Android Doze/App Standby battery optimization via `Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)` (this part is standard AOSP behavior across all OEMs and does have a documented API, unlike the OEM-specific autostart/lock screens).
- This is advisory UX, not a silent background hack — clearly explain to the user *why* you're asking them to change these settings (so the "data saver" doesn't itself get killed by the battery saver).

**Acceptance Criteria:**
- [ ] On a Xiaomi/MIUI test device (or an emulator image approximating it, if unavailable, note the gap explicitly and flag for manual testing on real hardware in Stage 10), the app detects the manufacturer and shows the correct instructions.
- [ ] On any manufacturer not specifically handled, the app falls back to the generic Android battery-optimization exemption flow rather than showing nothing.

Status (Stage 6 implementation pass): the fallback is structural, not conditional — `OemBatteryHelper.findAutostartScreen()` returns null for an unrecognised vendor and the card then renders the generic Doze steps, so "shows nothing" is not reachable. Both OEM criteria still need real hardware (Xiaomi/MIUI at minimum) and stay unchecked; see A13 in §7 for the full delta list.

---

### Stage 7 — Data Usage Stats Dashboard

**Objective:** Show real per-app data usage, both to build user trust ("here's what was blocked/saved") and as a debugging tool during development.

**Files to create:**
- `android/app/src/main/java/com/<pkg>/vpn/NetworkStatsReader.kt`

**Required behavior:**
- Use `NetworkStatsManager.querySummaryForDevice` / `queryDetailsForUid` for aggregate and per-UID stats. Reading data for apps other than your own requires the `PACKAGE_USAGE_STATS` permission — the same special permission already requested in Stage 3/4, so no additional consent flow is needed, just reuse the existing grant.
- Expose a method the JS layer can poll (or receive pushed on an interval) returning `{ packageName, bytesSent, bytesReceived, wasBlocked: boolean }` per app for a given time window (e.g. today, this week).
- `wasBlocked` is a heuristic your own app tracks (not provided by the OS): log, in your own local store, which packages were in the disallowed set at any given time, so you can later report "this app was blocked from N MB while in the background" — the OS network stats alone don't tell you *why* an app used zero bytes, only that it did or didn't.

**Acceptance Criteria:**
- [ ] Dashboard shows real numbers matching (approximately) what Android's own Settings → Data Usage screen reports for the same apps/period.
- [ ] Numbers update after toggling the firewall and using a couple of apps, without requiring an app restart.

Status (Stage 7 implementation pass): refresh happens on mount, on every return to the foreground, on demand, every 60s while a dashboard is open, and immediately when native pushes `statsUpdated` — so no restart is needed by construction. "Matches Settings → Data Usage approximately" is a device-only comparison and stays unchecked; see A14 in §7 for what the numbers mean and what they deliberately do not claim.

---

### Stage 8 — Firebase Integration (Auth + Firestore Sync)

**Objective:** Persist user settings across reinstalls/devices; this is explicitly a settings/metadata store, not part of the VPN data path.

**Data model (Firestore, illustrative — adjust collection/document names to project convention):**
```json
// users/{uid}/settings/firewall
{
  "firewallEnabled": true,
  "alwaysAllowedPackages": ["com.google.android.gms", "com.android.dialer", "com.<pkg>"],
  "vpnEnabled": false,
  "preferredServerRegion": "sg" // Singapore, nearest to Philippines — set in Stage 9
}
```

**Tasks:**
- [ ] Firebase Auth: anonymous auth is sufficient for a private single-purpose app unless the project already has an account system elsewhere — do not introduce email/password flows unless asked.
- [ ] Read settings on app start and apply them (start/stop firewall accordingly, populate allow-list UI) before the user manually touches anything.
- [ ] Write-through on every settings change; debounce rapid toggles to avoid excessive writes.
- [ ] Handle offline gracefully — cache last-known settings locally (e.g. `AsyncStorage`/MMKV) so the firewall still respects the user's last choice with no network connection to Firestore.

**Acceptance Criteria:**
- [ ] Toggling a setting, killing the app, and relaunching restores the same state, both online and (from local cache) with no network connectivity.
- [ ] No feature in Stages 2–7 breaks when Firebase is unreachable — Firestore sync failures must degrade gracefully, never crash the firewall itself.

Status (Stage 8 pass, 2026-09-28): implemented up to the point a Firebase project is required; the two acceptance criteria are kill-and-relaunch tests on real hardware and stay unchecked (A6). Files: **new** `app.config.js` (turns `app.json` into a static base and decides Firebase presence), `src/lib/firebase.ts` (null-returning handles), `src/context/firebase-context.tsx` (anonymous sign-in, inert when unconfigured), `src/services/firewall-settings.ts` (Firestore doc + AsyncStorage tier + 750 ms coalescing), `src/components/settings-sync.tsx` (mounted in `src/app/_layout.tsx` inside `VpnProvider`); `vpn-context` gained `firewallSettings` / `applyRemoteSettings`. Local-first ordering is deliberate: the cache is what satisfies "no network" — Firestore is a mirror on top, and every failure is a `console.warn`. Rules to publish with the project (locked to the owning uid; the anonymous uid is the only principal that exists):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/settings/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Remaining, all console/device-bound: create the project → enable Anonymous sign-in → register Android app `com.souljsx.spot` with the SHA-1 from `npx eas-cli@latest credentials` → download `google-services.json` → keep it at the repo root for local builds (gitignored) and register it for cloud builds with `npx eas-cli@latest env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production --scope project` (A16: `eas.json` pins no environment, so a build is asked which one it uses and the secret must live in that one) → rebuild the dev client, since autolinking changed the native graph → run both criteria.

---

### Stage 9 — VPN Tunnel Backend

**Objective:** Layer an actual remote VPN tunnel onto the same `VpnFirewallService`, so that instead of dropping captured (non-foreground-app) packets, or — when the user explicitly enables "VPN mode" for the currently allowed app too — all traffic is relayed through a real server.

**Before starting this stage:** confirm with the human operator which backend was actually provisioned (this plan supports either; do not silently pick one):
- **Option A — WireGuard:** wrap `com.wireguard.android` (official Kotlin library, distributed as an AAR/Maven artifact) inside `tunnel/WireGuardTunnelClient.kt`. Requires a per-user key pair and a server-side peer config (out of scope for the coding agent — request the provisioning API/credentials format from the human operator).
- **Option B — Outline/Shadowsocks:** wrap the Outline/`shadowsocks-android` client libraries similarly. Simpler key model (access keys) but a different underlying protocol; do not mix WireGuard and Shadowsocks code paths in the same `TunnelClient` interface implementation — pick one for the MVP.

**Required behavior:**
- Define a `TunnelClient` interface (`connect(config)`, `disconnect()`, `isConnected()`) so the concrete backend can be swapped later without touching `VpnFirewallService`.
- `VpnFirewallService`'s TUN read loop changes from "read and discard" to "read and hand off to `TunnelClient` for relay" **only for packets belonging to apps the user has opted into VPN mode for** — decide with the human operator whether VPN mode applies to (a) all captured (non-foreground) traffic, (b) the foreground app itself, or (c) an explicit separate "always use VPN" allow-list; do not assume without confirming, since this materially changes the addAllowedApplication/addDisallowedApplication configuration.
- Use `VpnService.protect(socket)` on any socket the tunnel client itself opens to talk to the remote VPN server, to avoid routing the tunnel's own control traffic back into itself (an infinite loop).
- Server region selection: default to the nearest provisioned region to the Philippines (Singapore is the typical closest common cloud region) but make it a user-visible setting per the Firestore schema in Stage 8, not a hardcoded value.

**Acceptance Criteria:**
- [ ] With VPN mode on, a test app's traffic is confirmed (via server-side logs or a "what's my IP" check) to be egressing from the remote server, not the device's real connection.
- [ ] Toggling VPN mode off cleanly falls back to firewall-only (sinkhole) behavior without requiring an app restart.
- [ ] Battery/latency impact is measured and logged, not just assumed acceptable.

---

### Stage 10 — QA Matrix & Release Prep

**Objective:** Systematic verification before considering the Android-first MVP "done," and an explicit list of what's deferred to a public-release phase.

**Device/OEM matrix (minimum):**
- [ ] Stock Android (Pixel or emulator, AOSP-close) — baseline.
- [ ] Samsung One UI.
- [ ] A Xiaomi/Redmi/Poco MIUI or HyperOS device — highest priority given the Philippines market.
- [ ] An Oppo/Realme or vivo device, if available.

**Functional checklist:**
- [ ] Firewall blocks background apps and allows the foreground app across all matrix devices.
- [ ] Foreground-app switching updates within acceptable latency on all matrix devices (OEMs with aggressive Doze may show slower `UsageStatsManager` event delivery — measure, don't assume it's identical to stock Android).
- [ ] Service survives screen-off, Doze, and app-switching stress for a sustained period (target: multi-hour soak test) on each matrix device.
- [ ] Firestore sync round-trips correctly; offline cache works.
- [ ] VPN mode (Stage 9) egresses correctly and cleanly falls back.

**Deferred to public-release phase (do not implement now, just confirm these are tracked):**
- [ ] `QUERY_ALL_PACKAGES` Play Console declaration + justification video, if this permission is retained (Section 8 covers a possible narrower alternative).
- [ ] `specialUse` foreground-service-type justification to Google, if challenged.
- [ ] Production key/credential provisioning flow for the VPN backend (currently assumes the human operator manually provisions).
- [ ] Any GPL-derived code review (Section 8).

---

## 7. Known Constraints & Design Decisions (running log)

Add an entry here whenever an implementation choice is made that isn't fully pinned down above, so later stages/readers don't have to reverse-engineer *why*.

- Android permits only **one active `VpnService` at a time system-wide** — the firewall and the VPN tunnel must be the same service instance in different modes, never two separate `VpnService`s running concurrently.
- `addAllowedApplication()`/`addDisallowedApplication()` are mutually exclusive per `Builder` instance (confirmed via official Android reference docs) — this plan uses disallow-mode exclusively; do not mix in allow-mode calls anywhere in the codebase.
- There is no runtime permission prompt for Usage Access (`PACKAGE_USAGE_STATS`) — it can only be granted via a Settings deep link, unlike normal dangerous permissions.
- **[A1 — Stage 0, 2026-09-26] Project shape.** This repo is Expo SDK 57 + expo-router + dev client, not bare RN. Per §2 we take the "Expo with `expo prebuild` / dev client" path: ran `npx expo prebuild --platform android` (generates gitignored `android/`). Baseline checks on this machine: `npx tsc --noEmit` clean, `npx expo lint` clean, `npx expo-doctor` 21/21. Application ID is `com.souljsx.spot` (app.json) → native package root is `com.souljsx.spot.vpn`. No placeholder IDs anywhere.
- **[A2 — Stage 0] Native code location (CNG deviation from literal plan paths).** `android/` is generated, gitignored (`/android` in `.gitignore`), and wiped by `prebuild --clean` — so the plan's `android/app/src/main/java/com/<pkg>/vpn/*.kt` paths are replaced by a local Expo module `modules/vpn-firewall/` (Stage 1 creates it via `npx create-expo-module --local`), Kotlin at `modules/vpn-firewall/android/src/main/java/com/souljsx/spot/vpn/*.kt`, service entry in the module's own `AndroidManifest.xml` (merged at build). Class/method names from the plan skeletons stay identical; JS surface stays `src/native/VpnFirewall.ts`. Workspace rule "never hand-edit `android/`" wins over the literal paths.
- **[A3 — Stage 0] Firebase deferred to Stage 8.** No Firebase project and no `google-services.json` exist; §6 forbids fabricating a config, and Stages 1–7 need no Firebase. Landing steps for Stage 8: human creates Firebase project → register `google-services.json` via the `@react-native-firebase/app` config plugin entry in app.json → `npx expo install @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore`.
- **[A4 — Stage 0] Screens already exceed the DoD.** The plan's "three empty screens" predates the real UI. Mapping: Dashboard → `src/app/index.tsx` (Protection), allow-list controls → `src/app/data-saver.tsx`, Settings → `src/app/settings.tsx`; `src/app/locations.tsx` is the Stage 9 VPN-locations screen. No empty duplicates created. Current state lives in `src/context/vpn-context.tsx` (hardcoded mock); Stage 5 rewires it to native events.
- **[A5 — Stage 0] Toolchain actuals.** Expo SDK 57 template pins (fallbacks in `ExpoRootProjectPlugin.kt`; the version catalog may override — confirm resolved values in the first build log): compileSdk 35, targetSdk 35, minSdk 24, buildTools 35.0.0, NDK 27.1.12297006, Kotlin 2.0.21. Gradle wrapper 9.3.1, local JDK 21, Node 25.2.1, newArch + Hermes on. Stage 2's `specialUse` FGS values were specced for SDK 34+; still valid at 35 — recheck exact strings when implementing Stage 2.
- **[A6 — Stage 0] Build/verify path on this machine.** No Android SDK/Studio, no connected device, no Python (so the `graphify` CLI can't refresh `graphify-out/` — it was built from `a18d3706` and is stale for the newer untracked screens; using `graph.json` as static navigation data meanwhile). Expo CLI IS authenticated as `hansoul` (shared session works for `npx eas-cli@latest`). So `./gradlew assembleDebug` cannot run locally; equivalent baseline verification is either (a) cloud: `npx eas-cli@latest build --profile development --platform android`, or (b) local after installing SDK 35 + build-tools 35 + NDK 27.1.12297006.
- **[A7 — Stage 1, 2026-09-26] Bridge API corrections (spec fixes, not deviations).** (1) Kotlin `AsyncFunction` bodies cannot declare both a `Promise` param and a direct return value in the same overload — Stage 1 stubs use `Promise`-param style for all seven methods. (2) Expo Modules Kotlin supports `List<String>` parameters (JS string arrays arrive as `List<String>`), so `startFirewall` keeps its `List<String>` first arg, not a bare `String`. (3) `expo-module.config.json` must include `"android": { "modules": [...] }` listing the module class — Android DOES use it (it drives the generated package provider), so `"platforms": ["android"]` alone is not sufficient. (4) `npm pack expo-module-template@latest` / `npx create-expo-module` (interactive, no unattended flag) were replaced by hand-written files mapped 1:1 from the EJS template placeholders. (5) JS side uses `requireNativeModule` + `NativeModule.sendEvent` model from the current docs, not `NativeModules`/`NativeEventEmitter` from the pre-plan RN bridge era. (6) Caveat: this box has Node 25.2.1, which makes some Expo CLI tool runs misbehave (hangs/timeouts); the code/config above is per-docs and needs one real build on a supported runtime to green-light. EAS attempts: builds 1–4 all ERRORED in "Install dependencies" — root cause was the lockfile being born under npm 11 while workers run npm 10.9.8 (different arborist expansion of the `unrs-resolver`→`@emnapi/*` subtree; npm 10 wants top-level `@emnapi/*@1.11.3`). Fixed by re-locking with the real npm 10.9.8 binary; both `npm@10 ci --dry-run` and `npm@11 ci --dry-run` now pass. Build 5 (`5df101d6`) then moved PAST install into `RUN_GRADLEW`, which caught a real bug in the Stage 1 Kotlin: `com.facebook.react.bridge.Promise` does not exist in the Expo-Modules-API context — the correct type is `expo.modules.kotlin.Promise` (its own interface with `resolve(Any?)`/`reject` overloads, convertible via `toBridgePromise()`). Corrected the import; all `AsyncFunction` bodies otherwise typecheck against that interface (`List<String>` param, `Map<String, Any?>` list payloads all supported). Also confirmed from build 5's log that autolinking DOES pick up the local module (`spot-vpn-firewall (0.1.0)`), so zero-dependency discovery works — no root `package.json` entry needed.
- [A8 — process change, 2026-09-26, at user's direction] No per-stage cloud builds. Each stage is implemented only after explicit user confirmation to start it; per-stage verification is limited to `npx tsc --noEmit` + `npx expo lint` + `npx expo-doctor`. Full EAS build + on-device verification happens once after all stages (or whenever the user requests it). No `eas build` without explicit approval — builds consume account minutes. Build b2341053 (Stage 1 code, still in progress when this rule took effect) was left running as an early signal only, not a gate. **[SUPERSEDED 2026-09-27, also at user's direction]** the build gate is lifted: `eas build` is now available for verification rather than forbidden, and the A12 Kotlin changes are the first thing that gets compiled with it.

- [A9 — Stage 2, 2026-09-27] Stage 2 implemented (manifest + `VpnFirewallService.kt` + real `VpnFirewallModule.kt` bodies + Prepare/Start/Stop dev buttons). Verifications passed: `tsc --noEmit` 0, `expo lint` 0, `expo-doctor` 21/21. Deltas vs. the §Stage-2 spec (all intentional): (1) Manifest lives in the module (`modules/vpn-firewall/android/src/main/AndroidManifest.xml`) and is merged at build time — service name is fully qualified (`com.souljsx.spot.vpn.VpnFirewallService`), not `.vpn.…` relative to the app namespace; `INTERNET` omitted from the module since the app manifest already declares it. (2) `QUERY_ALL_PACKAGES` added to the module manifest (needed by `getInstalledApps` on API 30+; plan's Stage 2 snippet omitted it) — carries the same Play-Console-declaration TODO as `specialUse`. (3) ~~Added `guardNotProtectedService()` immediately before `builder.establish()` (API 21+)~~ — **this claim is invalid; see A10(0)**: that method is private to the framework and not callable from our subclass, so the Stage-2 line would not have compiled; Stage 3 replaced it with containing `establish()`'s documented outcomes. (4) Added `onRevoke()` override → `stopSelf()` + `super.onRevoke()`; spec had none, so a key-icon revoke would have left the zombie foreground service running. (5) `tearDown()` also nulls `readerThread` after interrupt, and `establishInterface` tolerates `establish()` returning null (reader just no-ops; `START_STICKY` + a fresh Start press recovers). (6) `prepareVpn` implements the spec's "resolve based on result" via `BaseActivityEventListener` on the `ReactApplicationContext` (`appContext.reactContext` is typed plain `Context?` in expo-modules-core 57 — must cast; `addActivityEventListener` lives on ReactApplicationContext, removed again in `onActivityResult`), requestCode 9001, with `IN_PROGRESS`/`NO_ACTIVITY`/`NO_CONTEXT` guards. (7) `startFirewall` defensively appends `context.packageName` to the disallowed set server-side — JS can never sinkhole this app (or Metro on the dev client) by omission; the JS wrapper's type doc says the arg is "allowed bypass" but the native contract is "disallowed" — Stage 3 renames it before UI integration. (8) `getInstalledApps` is the raw `getInstalledApplications(GET_META_DATA)` list sorted by lowercase label, no system-app filtering yet (Stage 5 UI filters); runs on the module thread — acceptable for a dev screen, revisit if jank appears. (9) Notification channel is created lazily inside `buildNotification()` with `IMPORTANCE_LOW`; `POST_NOTIFICATIONS` intentionally not requested — FGS still runs without a visible notification on 13+, revisit in Stage 4 compliance pass. Dev screen: `native-bridge.tsx` now has 1·Prepare VPN (`isVpnPrepared` → `prepareVpn`), 2·Start firewall (demo allow-bypass = `com.android.chrome` + self), 3·Stop firewall, plus the real (non-stub) app list; `hasUsageAccessPermission`/`openUsageAccessSettings` remain Stage 3 stubs. NOTE: none of this has compiled Kotlin yet — first real compile happens at the deferred end-of-stages EAS build (per A8), or on request.
- [A10 — Stage 3, 2026-09-27] Stage 3 implemented (`ForegroundAppWatcher.kt` + `FirewallEvents.kt` new; `VpnFirewallService.kt`, `VpnFirewallModule.kt`, module manifest, `src/native/VpnFirewall.ts`, dev harness all extended). Verifications: `tsc --noEmit` 0, `eslint` 0 on the two TS files, prettier applied. **Kotlin still has never been compiled** (A8 unchanged) — every fact below was checked against the installed sources / AOSP rather than memory. Deltas + corrections: **(0) A9(3) was wrong — `guardNotProtectedService()` is not a callable API.** `Builder.establish()` in current AOSP (`frameworks/base/core/java/android/net/VpnService.java`) contains no such call, and the historic variant was `private` in the framework class, so the Stage-2 call site would have failed the first Kotlin compile with an unresolved reference. It is replaced by containing every documented `establish()` outcome: returns null when not prepared / revoked, throws `IllegalArgumentException` (bad parameter), `IllegalStateException` (rejected parameter or binder failure) or `SecurityException` (service mis-declared). There is no public "a protected VPN already owns the interface" probe, so no pre-check is possible. (1) **Handover order reversed**: the old descriptor is now closed *after* a successful `establish()` instead of before it, because the framework deactivates the previous interface on a successful new establish (its javadoc says so explicitly) — this removes a fail-open window that the Stage-2 teardown-first order opened on every foreground change, which Stage 3 triggers constantly. `applyBypass()` now records the new bypass set only on success, so a failed update keeps the previous policy running and reports `{error}` without claiming `running:false`; only a failure with no interface at all is fatal (`running:false` + `stopSelf()`). (2) **Event plumbing**: a `VpnService` has no JSI emitter — `Module.sendEvent` resolves through `AppContext.eventEmitter(module)`, which requires the *registered* module instance. So `FirewallEvents` is a process-wide bus; the module installs an identity-checked publisher in `OnCreate` and removes it in `OnDestroy` (identity check matters because a dev reload tears the old instance down after the new one has installed), and every emission hops through `runtime.schedule` because JSI calls are confined to the JS thread while watcher events arrive on the poll thread. Service→JS payloads are `{type, payload}` per §5: `foregroundAppChanged {packageName,label}`, `stateChanged {running?,watching?,error?}`. (3) **`queryEvents()` takes wall-clock epoch millis, not `elapsedRealtime()`** — feeding it uptime would have made every foreground lookup come back empty and the feature silently dead; query windows use `System.currentTimeMillis()`, the 400 ms debounce uses `SystemClock.elapsedRealtime()` so a user changing the clock can neither stall nor spam a re-establish. (4) **API-level guards are mandatory, not optional** — minSdk is 24 (RN 0.82 `libs.versions.toml`: minSdk 24 / targetSdk 36 / compileSdk 36): `unsafeCheckOpNoThrow(String,int,String)` was *added in API 29* (confirmed via the official API-29 diff page; the `String` overload of `checkOpNoThrow` predates 29 and is only deprecated there), and `NotificationChannel` is API 26. (5) `PACKAGE_USAGE_STATS` added to the module manifest with `tools:ignore="ProtectedPermissions"` — `UsageStatsManager`'s class javadoc requires the declaration; it is signature|privileged|appop so a normal app is never actually granted it, which is exactly why the real signal is the `AppOpsManager` app-op mode, read on every watcher tick so access granted while the firewall runs is picked up without a restart (and revocation degrades to the static bypass set). (6) `EXTRA_DISALLOWED` → `EXTRA_ALWAYS_ALLOWED` and the service parameter is `bypassPackages`, finishing A9(7)'s naming fix; the `addDisallowedApplication` inversion (disallowed-from-tunnel = keeps working) is documented at both sites. `updateDisallowedApps` → `updateAlwaysAllowed` (the intent path via `onStartCommand` remains the real caller). (7) `openUsageAccessSettings` became `AsyncFunction` (`Promise<void>`, rejects `USAGE_SETTINGS_UNAVAILABLE`) instead of the spec's fire-and-forget `Function`, so Stage 4 can tell "user declined in Settings" apart from "this skin exposes no Usage Access screen". (8) Watcher semantics: 250 ms poll (spec asked 1–2 s; polling is a cheap AppOps check plus an incremental event read, and the 400 ms debounce — not the poll rate — is what protects the TUN from thrash), `MOVE_TO_FOREGROUND`/`MOVE_TO_BACKGROUND` via their literal values 1/2 (same numbers as the API-29 `ACTIVITY_RESUMED`/`ACTIVITY_PAUSED` replacements), a 6-hour initial scan so an app that has been open for hours is found at startup, and backgrounding the believed-foreground app resolves to `null` (launcher/shade/recents → only always-allowed + self bypass). (9) Dev harness: `ALWAYS_ALLOWED` is now `[]` (the Stage-2 Chrome hardcode is gone, since foreground-following *is* the test), plus a Usage Access button, a re-check on `AppState === 'active'` (Stage 4's revoke-detection acceptance needs this hook), and a rolling log of the last 8 native events. (10) Stage 3's acceptance criteria need a device and are **unverified**: switching apps flips access within ~1 s, 10 switches in 3 s cause one re-establish and the final app ends up with data, and `hasUsageAccessPermission`/`openUsageAccessSettings` reflect reality. They join the deferred end-of-stages build gate.
- [A11 — Stage 4, 2026-09-27] Stage 4 implemented (consent/permission flows + foreground-service compliance). Files: module `AndroidManifest.xml` (+`POST_NOTIFICATIONS`), `VpnFirewallModule.kt` (new `getNotificationPermission` / `requestNotificationPermission` / `openAppSettings`; consent gate in `startFirewall`; `openUsageAccessSettings` made async), **new** `src/hooks/use-firewall-permissions.ts`, `src/native/VpnFirewall.ts`, dev harness `src/app/native-bridge.tsx` (`PermissionRow` gates + event-driven status), `VpnFirewallService.kt` (2 hardening fixes). Verifications: `tsc --noEmit` 0, `expo lint` 0, `expo-doctor` 21/21. Kotlin has still never been compiled (A8 unchanged) — every Android fact below was checked against installed sources/AOSP-shaped APIs, not memory. (0) **SDK numbers re-derived instead of remembered:** `android/app/build.gradle` reads `rootProject.ext.{compileSdk,minSdk,targetSdk}Version`, and the generated tree has no `gradle/libs.versions.toml` and no SDK keys in `android/gradle.properties`, so the values come from Expo's `expo-root-project` plugin rather than a readable file; the effective pins match the RN 0.86.3 catalog shipped at `node_modules/react-native/gradle/libs.versions.toml` → minSdk 24 / compileSdk 36 / targetSdk 36 / buildTools 36.0.0 / AGP 8.12.0 / NDK 27.1.12297006, and expo-build-properties' own v57 docs use 36/36/36.0.0. **A5's "compileSdk 35 / targetSdk 35" is superseded by this** (first build log still confirms it). The Stage-4 audit ran against **targetSdk 36**: `foregroundServiceType="specialUse"` + `FOREGROUND_SERVICE_SPECIAL_USE` is the required pair for a non-media/non-health/non-datasync `VpnService` on 14+, and `specialUse` is exempt from the time-limited-FGS rules Android 15 added for `dataSync`/`mediaProcessing`. (1) Task "call `startForeground()` inside the OS window" is satisfied by construction and was re-read, not assumed: it is the *first* statement of `onStartCommand`, before intent parsing, before `applyBypass()`/`establish()`, before the watcher starts, and nothing on that path touches network or disk; the module starts the service through `ContextCompat.startForegroundService`, so Android 12+'s background-start refusal arrives as a caught exception (`FGS_START_NOT_ALLOWED`) instead of a crash. (2) **Audit gap 1 — fixed:** `startForeground()` was unguarded. Where an OEM has stripped the FGS permission (`SecurityException`) or Android decides the window was missed (`ForegroundServiceDidNotStartInTimeException`), the exception escaped `onStartCommand` on a *background* `START_STICKY` redelivery and killed the whole app. It is now wrapped: emits `stateChanged {running:false, error:"Android refused the foreground service (…)"}`, `stopSelf()`, returns `START_NOT_STICKY` so Android stops redelivering into the same failure. (3) **Audit gap 2 — fixed:** `onDestroy` never released the notification, so a `stopService()` landing while a `START_STICKY` restart is pending could leave a dead "Data Saver firewall" notice in the shade; it now calls `stopForeground(STOP_FOREGROUND_REMOVE)` — the int overload is API 24, exactly our minSdk, so no version branch is needed. (4) Notifications are deliberately **not** a start gate: the plan asks for a request before the foreground service plus graceful handling of denial, and Android confirms the service runs with the notification merely hidden - so Start stays enabled and the UI states the trade-off. `getNotificationPermission` re-reads the system every call and returns five states because Android has no single "granted?" API here: `NotificationManager.areNotificationsEnabled()` covers the app-wide Settings toggle (turning that off hides everything as surely as a runtime denial), `shouldShowRequestPermissionRationale(POST_NOTIFICATIONS)` separates "denied, will ask again" from "Android won't ask", and a `SharedPreferences` flag (`notifications_asked`, written natively just before the dialog) turns the *absence* of rationale into `permanently_denied` vs `not_asked`; the flag lives in native prefs, not JS memory, so a dev reload cannot reset a dead end into looking fresh. On API < 33 there is no prompt at all: `not_required` when the toggle is on, `permanently_denied` when off, because Settings is then the only way out. (5) `requestNotificationPermission` resolves as soon as the dialog has been handed to Android - the user's answer is never the resolved value - mirroring Usage Access so no gate anywhere trusts a callback; it rejects `NO_RUNTIME_DIALOG` (<33) / `NO_ACTIVITY` precisely so the caller's escape hatch (`openAppSettings` -> `ACTION_APPLICATION_DETAILS_SETTINGS`) fires instead of a silent no-op, and that pair is what makes the "no dead-ends" DoD item satisfiable. It uses framework `Activity.requestPermissions(...)` (API 23+) rather than RN's `PermissionsAndroid` to keep the whole consent path inside the module. (6) New `src/hooks/use-firewall-permissions.ts` is the single source of truth Stage 5 must reuse: three `ConsentStatus` gates where `null` means "not read yet" and is rendered `unknown`, never red; `nextMissingGate` encoding the plan's mandated order (vpnConsent -> usageAccess, notifications never blocking); derived `canRunFirewall` / `canFollowForegroundApp`; the `AppState -> "active"` re-read that is DoD item 2; and the `request*` wrappers. All three reads are `.catch(() => null)` inside one `Promise.all` so a single dead native call cannot blank the other two. (7) Two toolchain facts worth keeping: this repo's flat eslint config enables strict `react-hooks/set-state-in-effect`, which is why `refresh()` writes state from the `Promise.all(...).then()` handler instead of after an `await` in the mount effect, and `useCallback` deps must name the destructured `permissions.refresh` rather than the hook's object literal (new every render) or `exhaustive-deps` warns. (8) Deliberate deviation: no rationale *screens* yet - Stage 5 owns onboarding UI (A4), so Stage 4's rationale lives in the harness `PermissionRow` hint strings and the JSDoc on every bridge method; Stage 5 is expected to lift those strings into screens, not to write new permission logic. (9) DoD status: item 1 (fresh install walks VPN consent then Usage Access with no dead ends) and item 2 (Usage Access revoked in Settings while the app sleeps shows "missing" on resume) are **device-only and NOT verified** - no device/emulator on this box (A6/A8). Everything statically checkable is green. (10) Wiring was confirmed rather than assumed: `android/settings.gradle` calls `expoAutolinking.useExpoModules()`, which is what includes local `modules/*` as Gradle projects, so the new permission line in the module manifest merges into the app at **build** time via the normal library manifest merger - no `expo prebuild` re-run is required for Stage 4's manifest change (relevant because `android/` here predates it and is gitignored per A2).
- **[A12 — Stage 4 hardening, 2026-09-27] Expo-Go safety + survival audit.** Files: `src/native/VpnFirewall.ts`, `src/hooks/use-firewall-permissions.ts`, `VpnFirewallService.kt`, `modules/vpn-firewall/package.json` (+ deleted `modules/vpn-firewall/src/index.ts`). Verified: `tsc --noEmit` 0, prettier clean on both TS files; `eslint` on them could not finish inside the 30s tool budget (repo-wide lint is slow to cold-start) — re-run `npx expo lint` before relying on this line. **Concurrent-edit warning:** during this pass `ForegroundAppWatcher.kt` (Handler→poll thread, added `onWatchingChanged` + debounce), `src/app/native-bridge.tsx`, and this file (`expo-migration-plan.md` → `ANDROID_IMPLEMENTATION_PLAN.md`) all changed on disk mid-session, and one in-place Kotlin edit had to be reverted because the watcher's callback signature changed underneath it. Re-read Kotlin before editing it. The rewritten harness no longer imports `expo-clipboard`, which was never installed — keep it that way, or `npx expo install` it.
  (1) **The bridge stopped throwing at import.** `requireNativeModule` throws when the module is absent (verified in `node_modules/expo-modules-core/src/requireNativeModule.ts`), and it throws while the *importing* module evaluates — so the first real Stage-5 screen importing the bridge would white-screen the whole app under Expo Go or a browser render, which contradicts Stage 1's DoD ("usable during development in Expo Go"). Now: `requireOptionalNativeModule` + `isFirewallAvailable()` + one `withModule()` choke point that converts absence into a rejected promise, and `vpnEvents.addListener` hands back a no-op subscription so screens subscribe unconditionally.
  (2) **Consent can no longer hang forever.** Kotlin settles `prepareVpn` only from `onActivityResult`; if the activity dies while the system dialog is up (recents swipe, OEM memory pressure) nothing ever settles it and the UI is stuck on "requesting". A 120s JS deadline turns that dead end into a retryable error; the true state still arrives from `isVpnPrepared()` on the next resume.
  (3) **The bypass list survives process death.** `START_STICKY` redelivers a *null* intent and the replacement instance has empty fields, so the old code came back with the tunnel up and *nothing* exempted — sinkholing precisely the apps the user chose to keep online. The list is now written to the module's `vpn_firewall` prefs on every start and re-read when the intent carries nothing.
  (4) **Rejected exemptions are reported.** `addDisallowedApplication` failures were swallowed, so an app that could not be exempted stayed silently *blocked* (the opposite of the user's intent); the count now surfaces as a `{error}` `stateChanged` event while the interface stays up.
  (5) **Hook semantics fixed.** `nextMissingGate` now fires only on a *confirmed* `missing`: unknown was treated as actionable, so the UI could offer "Ask Android" before the first read had landed. Added `isPendingFirstRead` (neutral "checking" state) and `firewallAvailable`; a total read failure (all three, i.e. no module at all) sets `lastError` instead of rendering three permanent unknowns.
  (6) **Removed the dead duplicate TS surface** `modules/vpn-firewall/src/index.ts` — zero importers, and drifted from reality (`openUsageAccessSettings(): void`, no notification API) — plus the `main` key pointing at it; `expo-module.config.json` declares android-only, so no JS entry is needed. `src/native/VpnFirewall.ts` is the single JS surface (A2 unchanged).
  (7) **Still open:** Kotlin has never been compiled (A8 unchanged). Deferred knowingly: `PackageManager` label lookups in `handleForegroundChange`/`buildNotification` run on the main thread (≤1 per debounced tick; a clean fix means changing the watcher callback again), and `updateAlwaysAllowed()` remains unreachable dead code that a comment says was kept on purpose.





- [A13 — Stage 6, 2026-09-28] Stage 6 implemented (OEM battery-manager onboarding). Files: **new** `OemBatteryHelper.kt`; module `AndroidManifest.xml` (+`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, carrying a TODO(play-policy) marker because Play asks for a declaration for it); `VpnFirewallModule.kt` (new `getBatteryOptimizationStatus` / `requestIgnoreBatteryOptimizations` / `openAutostartSettings`); `src/native/VpnFirewall.ts`; **new** `src/hooks/use-battery-optimization.ts` and `src/components/battery-optimization-card.tsx`, rendered from `src/app/settings.tsx`; inline DoD annotations added to §Stage 6. Verifications: `tsc --noEmit` 0, `expo lint` 0, and every cross-file Kotlin usage was grepped against its declaration before building. Deltas vs the §Stage-6 spec (all intentional): (1) The plan's `android/app/src/main/java/com/<pkg>/vpn/OemBatteryHelper.kt` path is the module's path instead (A2). (2) Native returns **facts** only — vendor key, Doze exemption state, whether a vendor autostart screen resolves and which component, model, API level — and owns no user-facing copy; all wording lives in the TSX card so it can be reworded or translated without a native rebuild. (3) "Show a screen" is a settings card rather than a new route, because A4 already maps Settings → `src/app/settings.tsx`; the card is self-contained and can be lifted into a dedicated onboarding flow unchanged. (4) The vendor table is best-effort **and resolved before use** (`PackageManager.resolveActivity`, package visibility unrestricted thanks to the existing `QUERY_ALL_PACKAGES`): OEM activity names get renamed by OTAs, so an unresolved entry returns null and the card renders the written steps rather than a button that does nothing. Samsung's autostart list no longer exists on One UI, so its entry targets the battery screen and its steps say that. (5) `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (the direct dialog) requires the manifest permission; when it does not resolve, the code opens `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` (no permission required) and resolves `false`, so the UI can say which of the two actually happened instead of claiming success. (6) Per §0 rule 3, both OEM acceptance criteria are hardware-only and remain unchecked (annotated inline in §Stage 6); what this pass proves is only that the fallback path is structural.


- [A14 — Stage 7, 2026-09-28] Stage 7 implemented (data-usage dashboard). Files: **new** `NetworkStatsReader.kt` and `BlockLogStore.kt`; `VpnFirewallService.kt` (sinkhole byte counter flushed every 5s, `instance`/`isRunning()`, a 30s-throttled `statsUpdated` emission, block-interval bookkeeping on every applied bypass set and on shutdown); `VpnFirewallModule.kt` (new `getDataUsage(window, packages)`); `src/native/VpnFirewall.ts`; **new** `src/hooks/use-data-usage.ts` and `src/components/data-usage-card.tsx`, rendered from `src/app/data-saver.tsx`; the `statsUpdated` member of `VpnFirewallEvent` went from `unknown` to a real payload type; inline DoD annotation added to §Stage 7. **API facts were verified against the android-28 SDK stub sources (`prebuilts/fullsdk/sources`) rather than memory, because guessing this exact area is what failed build 4** (see A10): `querySummaryForDevice(int, String, long, long)` returns `NetworkStats.Bucket` and is documented as nullable; `queryDetailsForUid(int, String, long, long, int)` returns `NetworkStats`; `NetworkStats.getNextBucket(Bucket)` returns boolean and *fills the caller's bucket* — there is no allocating overload, exactly as with `UsageEvents`; `NetworkStats implements AutoCloseable` with a public `close()`. Deltas vs the spec: (1) The spec's `{packageName, bytesSent, bytesReceived, wasBlocked}` is returned as `{packageName, label, bytes, blockedMillis}`: rx and tx are summed because the direction split of a sinkholed app tells the user nothing, and `blockedMillis` (null = "never tracked") carries strictly more information than the boolean, which stays derivable from it. (2) Each uid costs one binder round-trip, so the report is a capped sample (≤60 uids queried, ≤25 apps returned) whose candidate set is "packages with tracked blocked time ∪ what JS asks about ∪ ourselves", while the device total is a single call; JS passes the foreground app so the app the user is actually looking at is always measured. (3) `wasBlocked` is implemented as **blocked intervals** per package, bucketed per local calendar day inside the module's existing `vpn_firewall` prefs (JSON, so there is still one store), split across midnight with `Calendar` rather than millis arithmetic so a DST change cannot drop or duplicate an hour. It can only know packages that have been in the bypass set at least once, therefore `blockedMillis: null` means "unknown" and never "definitely unblocked" — the UI shows a dash for those. (4) A hard process kill never runs `onDestroy`, which would otherwise leave an interval open forever and inflate every later reading; `blockedMillis(..., running = VpnFirewallService.isRunning())` closes stale intervals when the tunnel is down, and `onDestroy` closes them on the normal path. (5) Mobile only (`TYPE_MOBILE`): the product is a mobile-data saver, and folding wifi into the same total would make "saved" meaningless. (6) "Saved" is our own sinkhole counter — bytes read off the TUN and discarded, flushed every 5s and persisted per calendar day — never an OS figure; the UI labels it "Blocked" and states what it is, because TCP retransmits mean it is not a promise of money saved. (7) `statsUpdated` now actually fires: it is the event the Stage-1 union reserved and that nothing had ever emitted. (8) Per §0 rule 3, both acceptance criteria are device-only comparisons ("matches Settings → Data Usage approximately") and remain unchecked, annotated inline in §Stage 7. **Caveat: Kotlin had still never been compiled when this entry was written — build 6 (`9da531b7`) was in flight; see A15 for the outcome.**


- [A15 — build gate, 2026-09-28] Build 6 (`9da531b7-d3ed-4593-8611-6708256a7631`, profile `development`, Android) **FINISHED**, every phase `success` — `RUN_EXPO_DOCTOR` 5.2s, `RUN_GRADLEW` 737s. This is the first build in the project's history in which the whole Kotlin module compiled clean on the first attempt (builds 1–5 each surfaced something; A10 and A14 record the two API-assessment mistakes behind the earlier failures), so Stages 3–7 now all have a compiling implementation behind them. Checks run alongside it: `npx tsc --noEmit` 0, `npx expo lint` 0 — and that lint pass found two real `react-hooks/set-state-in-effect` errors in the two new hooks, now fixed by moving setState into promise callbacks — plus `npx expo export --platform android`, which built the 3.8 MB Hermes bundle and so proves the new cards/hooks resolve and bundle rather than merely typecheck. APK: https://expo.dev/artifacts/eas/2kGmaQ6BAAHSci_xYGXs1KYZL7MhUmHdhNo2uy5Z1jc.apk. Nothing has been run on a device yet (A6: no hardware here), so every acceptance criterion that needs real hardware stays unchecked and is flagged inline in §Stage 6, §Stage 7 and §Stage 10. Remaining stages: 8 is blocked on a Firebase project + `google-services.json` (A3), 9 is blocked on the operator provisioning a tunnel backend and answering the VPN-mode-scope question, 10 needs the device matrix.


- [A16 — Stage 8, 2026-09-28] Firebase lands as an optional layer; every mechanism read from source instead of memory. (1) `@react-native-firebase/{app,auth,firestore}@26.4.0` (npm `latest`, peer `expo >=47`) via `npx expo install`, plus `@react-native-async-storage/async-storage@2.2.0` as the offline tier the plan suggests. (2) **The app plugin takes no props** except `ios.disableSPM` (`plugin/src/pluginConfig.ts`): it reads only `expo.android.googleServicesFile` and **throws** in `withCopyAndroidGoogleServices` when that field is unset *or* the file cannot be read. Registering it in `app.json` therefore breaks `expo prebuild` for every clone, CI job and EAS build that has no gitignored `google-services.json` — which is every run today. Fix: `app.json` becomes the static base and the new **`app.config.js`** decides, with `googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json'` (the docs' own idiom) and the plugin appended only when that path exists, publishing the verdict to JS as `extra.firebaseConfigured`. Verified both branches with `npx expo config --type prebuild`: absent → no plugin, no field, `firebaseConfigured: false`; present → both set. **The dynamic config must receive the static one as `module.exports = ({ config }) => …`, not `require('./app.json')`** — `@expo/config`'s `evalConfig.js` stamps the object it hands over with `NON_STANDARD_SYMBOL` and sets `mayHaveUnusedStaticConfig` when that stamp does not survive into the returned value, which expo-doctor reports as "your app.json is in your project, but your app.config.js is not using the values from it"; the require-form first shipped that regression (20/21 after A1's 21/21) and the request-form clears it. `expo install` auto-added the two plugin entries to `app.json`; reverted, because `app.config.js` owns them now and duplicates would double-apply. (3) **EAS file secrets**: `eas env:set --type file` uploads as `EnvironmentSecretType.FileBase64` (eas-cli `src/env/set.ts`) and the worker materializes it, exposing a path in the env var — hence `eas env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production --scope project`. `eas.json` profiles pin no `environment` today, so EAS asks which one a build uses; the secret must exist for the environment picked, or the var is undefined and the build ships without Firebase while still succeeding. (4) Nothing in JS may assume Firebase: `firebaseAuth()`/`firebaseDb()` return `null` when unconfigured *or* when the native module refuses (an autolinked-but-unconfigured module throws on first call), `FirebaseProvider` stays at `'disabled'`, and `SettingsSync` hydrates from cache in `'disabled'`/`'error'` — so a build without Firebase behaves exactly as it did before Stage 8, and a Firestore outage cannot reach the firewall (criterion 2). (5) API surface confirmed against the shipped `dist/typescript` declarations, not memory — v26 is modular like the web SDK: `getAuth(app)`, `signInAnonymously(auth)`, `getFirestore(app)`, `doc/getDoc/setDoc`, with types `Auth`/`Firestore`; the old `FirebaseAuthTypes.Module` namespaces do not exist. (6) `updatedAtMs: Date.now()` rather than `serverTimestamp()`, because a pending server timestamp reads back as `null` from the offline cache. (7) **Schema deviation**: the document also carries the toggles the UI actually owns (`publicWifiProtection`, `pauseOnDrop`, `blockTrackers`, `videoQualitySaver`, `compressPictures`, `saverStrength`, `enabledSaverAppIds`) so a reinstall restores what the user sees instead of a partial record; the plan's four fields ride along at defaults, with `alwaysAllowedPackages`/`preferredServerRegion` parked in `vpn-context` as the single handover point for the allow-list UI and Stage 9's region picker. `firewallEnabled`/`vpnEnabled` are stored but deliberately **not** applied on load: bringing the service up is Stage 2/4 consent flow (`prepareVpn` → `startFirewall`) and must never be triggered by a document read arriving. (8) No write happens before the first load resolves — otherwise the default state of the first render overwrites the document that is about to arrive, undoing the one thing this stage promises.
- [A17 — Stage 8 registration, 2026-09-28] Firebase project created by the operator. Registration values for this app: **Android package name `com.souljsx.spot`**, nothing else — Analytics unticked (the app uses no Analytics, and enabling it at registration drags in the analytics gradle plugin), and **both SHA-1 and SHA-256 left blank**: they are optional at registration and are not consulted by anonymous Auth or Firestore, only by Google Sign-In / reCAPTCHA / Dynamic Links. Fingerprints are also *not* embedded in `google-services.json`, so adding one later does not require re-downloading the file; when they are needed, read them from `npx eas-cli@latest credentials` — there is no `~/.android/debug.keystore` on this machine (confirmed absent; `~/.android` holds only the adb keys) because every build to date has been an EAS cloud build. The gradle steps the wizard shows after "Register app" are handled by the `@react-native-firebase/app` config plugin and must not be applied by hand, as `android/` is generated (CNG). Package name cannot be edited after registration — a typo means deleting the Android app and re-registering, which issues a new app id and a new `google-services.json`. The Firestore location picked when creating the database is permanent; Seoul (`asia-northeast3`) is the right choice for this user base and matches Stage 9's region-proximity plan.

- [A18 — tooling, 2026-09-28] `npx eas-cli@latest login` failed with `Cannot find module 'indent-string'` (Node 25, npm 11): the npx cache prefix was a partial install — `indent-string` held `package.json` + `index.d.ts` but no `index.js`. Concurrent background `npx eas-cli` probes run from this sandbox almost certainly raced the extraction and poisoned it. Deleted the `…\_npx\6bc7bae5c2059953` prefix; the fix is a plain retry in an interactive terminal so npx re-downloads cleanly. If it recurs: `npm cache clean --force`, or skip npx entirely with `npm i -g eas-cli` then `eas login`. `GOOGLE_SERVICES_JSON` visibility: **Secret** (chosen 2026-09-28; changeable later with `eas env:update --name GOOGLE_SERVICES_JSON --environment production --visibility secret`).

- [A19 — eas.json environment pinning, 2026-09-28] Checked Expo docs on EAS environment resolution (`/eas/environment-variables/usage`): when `build.<profile>.environment` is omitted, EAS defaults `developmentClient: true` builds to the `development` environment! Because `GOOGLE_SERVICES_JSON` was stored under the `production` environment, a cloud build under `--profile development` would not receive the file and would build without Firebase silently. Updated `eas.json` to explicitly pin `"environment": "production"` across all profiles (`development`, `preview`, `production`), ensuring any cloud build pulls the secret regardless of profile.

- [A20 — lockfile npm 10/11 compatibility, 2026-09-28] Build 7 (`261b255a-a0d6-445a-8a28-f8b12fe35be9`) failed during `npm ci --include=dev` on EAS cloud: `npm error Missing: @emnapi/core@1.11.3 from lock file`, `Missing: @emnapi/runtime@1.11.3 from lock file`. This is the same npm 10 vs 11 discrepancy identified in A7: local workstation runs npm 11 (`11.6.2`), while EAS cloud worker runs npm 10 (`10.9.8`). When `@react-native-firebase/*` and `@react-native-async-storage/*` were added, the local npm 11 pruned the top-level `@emnapi/core` and `@emnapi/runtime` packages that npm 10's arborist algorithm requires at the root. Fixed by running `npx npm@10.9.8 install --package-lock-only`, which reconciled the lockfile to satisfy both npm 10 and npm 11. Tested both `npx npm@10.9.8 ci --dry-run` and `npm ci --dry-run` locally — both exit 0 clean.





---

## 8. Licensing Notes

- **NetGuard** (github.com/M66B/NetGuard) is a useful architectural reference for the "sinkhole" pattern but is licensed **GPLv3**. This plan's code skeletons are original, not copied from NetGuard. Do not paste NetGuard source into this codebase; if a future stage wants to reuse actual NetGuard code, that decision needs explicit human sign-off first, since GPLv3 would then impose copyleft obligations on this app if it's ever distributed to anyone outside the immediate developer.
- WireGuard's Android/Apple libraries and Outline's client/server components are more permissively licensed (check the specific package chosen in Stage 9 before assuming license terms — verify at that time rather than relying on this note being current).

---

## 9. Reference Materials

- `VpnService.Builder` official reference: https://developer.android.com/reference/android/net/VpnService.Builder
- `NetworkStatsManager` official reference: https://developer.android.com/reference/android/app/usage/NetworkStatsManager
- NetGuard (architecture reference only — see Section 8 on licensing): https://github.com/M66B/NetGuard
- WireGuard Android: https://github.com/WireGuard/wireguard-android
- Outline Server: https://github.com/Jigsaw-Code/outline-server
- Xray-core (alternate protocol option for Stage 9): https://github.com/XTLS/Xray-core
- react-native-simple-openvpn (alternate RN VPN bridge if OpenVPN is chosen instead of WireGuard/Outline): https://github.com/ccnnde/react-native-simple-openvpn
- Android foreground service types (Android 14+): https://developer.android.com/about/versions/14/changes/fgs-types-required
- Google Play `QUERY_ALL_PACKAGES` policy (relevant only at public-release time): https://support.google.com/googleplay/android-developer/answer/10158779
- dontkillmyapp.com (OEM battery-manager behavior reference for Stage 6): https://dontkillmyapp.com
