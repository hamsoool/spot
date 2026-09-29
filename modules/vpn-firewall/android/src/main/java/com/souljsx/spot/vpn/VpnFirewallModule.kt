package com.souljsx.spot.vpn

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Stage 3: all bridge functions are live. The module additionally acts as the
// event gateway for VpnFirewallService, which has no React context of its own.
class VpnFirewallModule : Module() {

  private var preparePromise: Promise? = null

  // Held so OnDestroy can uninstall only *this* instance's publisher (a React
  // reload tears the old instance down after the new one has installed its own).
  private var eventPublisher: ((Map<String, Any?>) -> Unit)? = null

  // JSI calls are confined to the JavaScript thread, and service events arrive
  // on the watcher's poll thread — so hop through runtime.schedule before
  // sendEvent instead of assuming the caller's thread is safe.
  private fun publishEvent(body: Map<String, Any?>) {
    try {
      runtime.schedule { runCatching { sendEvent(EVENT_NAME, body) } }
    } catch (e: Exception) {
      // No live React instance hosts this module any more; drop the event.
    }
  }

  override fun definition() = ModuleDefinition {
    Name("VpnFirewallModule")

    // Single event channel, typed by payload — see plan §5.
    Events("VpnFirewallEvents")

    // VPN consent is delivered here rather than through RN's
    // BaseActivityEventListener: expo-modules-core keeps `react-android` as an
    // `implementation` dependency, so com.facebook.react.* is not on this
    // module's compile classpath, while AppContext already forwards every
    // activity result to the DSL.
    OnActivityResult { _, payload ->
      if (payload.requestCode != VPN_CONSENT_REQUEST) return@OnActivityResult
      val pending = preparePromise
      preparePromise = null
      if (payload.resultCode == Activity.RESULT_OK) pending?.resolve(true)
      else pending?.reject("VPN_DENIED", "User denied the VPN connection request.", null)
    }

    OnCreate {
      val publisher: (Map<String, Any?>) -> Unit = { body -> publishEvent(body) }
      eventPublisher = publisher
      FirewallEvents.install(publisher)
    }

    OnDestroy {
      FirewallEvents.uninstall(eventPublisher)
      eventPublisher = null
    }

    AsyncFunction("isVpnPrepared") { promise: Promise ->
      // prepare() NPEs on a null context — never pass reactContext through unchecked.
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      promise.resolve(VpnService.prepare(context) == null)
    }

    AsyncFunction("prepareVpn") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      val consent = VpnService.prepare(context)
      if (consent == null) {
        promise.resolve(true) // already granted
        return@AsyncFunction
      }
      if (preparePromise != null) {
        promise.reject("IN_PROGRESS", "A VPN consent request is already pending.", null)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity ?: run {
        promise.reject("NO_ACTIVITY", "No foreground activity to show the consent dialog.", null)
        return@AsyncFunction
      }
      preparePromise = promise
      // The result arrives through the OnActivityResult listener above; AppContext
      // already owns the ActivityEventListener, so nothing to register here.
      activity.startActivityForResult(consent, VPN_CONSENT_REQUEST)
    }

    AsyncFunction("startFirewall") { alwaysAllowed: List<String>, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      // Stage 4 gate: establishing without consent throws inside the service and
      // the failure surfaces as a dying tunnel instead of a usable error, so
      // refuse here while the UI can still route the user to the consent step.
      if (VpnService.prepare(context) != null) {
        promise.reject(
          "VPN_NOT_PREPARED",
          "The system VPN consent dialog has not been accepted yet.",
          null,
        )
        return@AsyncFunction
      }
      // Never trust JS with our own package: capturing ourselves would sinkhole
      // the dev-client Metro connection and look like a dead app. The service
      // unions this list with the current foreground app at runtime (Stage 3).
      val bypass = (alwaysAllowed + context.packageName).distinct()
      val intent =
        Intent(context, VpnFirewallService::class.java)
          .putStringArrayListExtra(EXTRA_ALWAYS_ALLOWED, ArrayList(bypass))
      try {
        // Android 12+ refuses foreground services started while the app is in
        // the background. Catching Exception rather than
        // ForegroundServiceStartNotAllowedException keeps this method
        // verifiable on API 24, where that class does not exist.
        ContextCompat.startForegroundService(context, intent)
      } catch (e: Exception) {
        promise.reject(
          "FGS_START_NOT_ALLOWED",
          "Android refused to start the firewall service (${e.javaClass.simpleName}). " +
            "Bring the app to the foreground and try again.",
          e,
        )
        return@AsyncFunction
      }
      promise.resolve(null)
    }

    // Stage 9: same service, same consent gate and the same bypass list — the TunnelConfig
    // JSON is what makes the service host the WireGuard tunnel instead of the sinkhole. The
    // service rewrites the config's ExcludedApplications on every foreground change, so the
    // bypass passed here is only the starting set.
    AsyncFunction("startVpnTunnel") { configJson: String, alwaysAllowed: List<String>, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      if (configJson.isBlank()) {
        promise.reject("INVALID_TUNNEL_CONFIG", "The tunnel config is empty.", null)
        return@AsyncFunction
      }
      if (VpnService.prepare(context) != null) {
        promise.reject(
          "VPN_NOT_PREPARED",
          "The system VPN consent dialog has not been accepted yet.",
          null,
        )
        return@AsyncFunction
      }
      val bypass = (alwaysAllowed + context.packageName).distinct()
      val intent =
        Intent(context, VpnFirewallService::class.java)
          .putStringArrayListExtra(EXTRA_ALWAYS_ALLOWED, ArrayList(bypass))
          .putExtra(EXTRA_VPN_CONFIG, configJson)
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (e: Exception) {
        promise.reject(
          "FGS_START_NOT_ALLOWED",
          "Android refused to start the VPN service (${e.javaClass.simpleName}). " +
            "Bring the app to the foreground and try again.",
          e,
        )
        return@AsyncFunction
      }
      promise.resolve(null)
    }

    /**
     * Turning the tunnel off is a *mode switch*, not a stop: a fresh intent without the
     * config makes the running service drop the tunnel and re-establish the sinkhole, so the
     * firewall survives. Stopping protection entirely stays stopFirewall().
     */
    AsyncFunction("stopVpnTunnel") { alwaysAllowed: List<String>, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      val bypass = (alwaysAllowed + context.packageName).distinct()
      val intent =
        Intent(context, VpnFirewallService::class.java)
          .putStringArrayListExtra(EXTRA_ALWAYS_ALLOWED, ArrayList(bypass))
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (e: Exception) {
        promise.reject(
          "FGS_START_NOT_ALLOWED",
          "Android refused to start the firewall service (${e.javaClass.simpleName}).",
          e,
        )
        return@AsyncFunction
      }
      promise.resolve(null)
    }

    AsyncFunction("stopFirewall") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      context.stopService(Intent(context, VpnFirewallService::class.java))
      promise.resolve(null)
    }

    AsyncFunction("getInstalledApps") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      val pm = context.packageManager
      val apps =
        pm.getInstalledApplications(PackageManager.GET_META_DATA)
          .map {
            mapOf(
              "packageName" to it.packageName,
              "label" to pm.getApplicationLabel(it).toString(),
            )
          }
          .sortedBy { (it["label"] as String).lowercase() }
      promise.resolve(apps)
    }

    AsyncFunction("hasUsageAccessPermission") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      promise.resolve(ForegroundAppWatcher.hasUsageAccess(context))
    }

    // Async rather than fire-and-forget: Usage Access is "special access", and
    // some OEM skins ship no matching screen. Stage 4 needs to distinguish
    // "user went to Settings and declined" from "there is no screen to open".
    AsyncFunction("openUsageAccessSettings") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      try {
        context.startActivity(
          Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        promise.resolve(null)
      } catch (e: ActivityNotFoundException) {
        promise.reject(
          "USAGE_SETTINGS_UNAVAILABLE",
          "This device exposes no Usage Access screen; grant it manually under " +
            "Settings > Apps > Special app access > Usage access.",
          e,
        )
      }
    }

    // ---- Stage 4: notifications ------------------------------------------------
    // State is read from the system, never remembered from a dialog callback: the
    // OS is the authority on whether the firewall's persistent notification will
    // actually be visible, and the app-level Settings switch matters as much as
    // the runtime grant. Same "ask, then re-check on resume" shape as Usage
    // Access, so the UI never assumes the user tapped Allow.
    AsyncFunction("getNotificationPermission") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      // The app-wide notification toggle (Settings > Apps > Spot > Notifications).
      // API 24+, which is our minSdk. False here means nothing we post is shown.
      val enabled =
        context.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled()
          ?: false

      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        // 24-32: POST_NOTIFICATIONS has no runtime prompt at all, so there is
        // nothing to request — only the Settings toggle can be off.
        promise.resolve(if (enabled) "not_required" else "permanently_denied")
        return@AsyncFunction
      }
      if (enabled) {
        promise.resolve("granted")
        return@AsyncFunction
      }
      val rationale =
        appContext.currentActivity
          ?.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)
          ?: false
      when {
        rationale -> promise.resolve("denied")
        // No rationale and never asked yet: the dialog will still appear the
        // first time, so this is not yet a dead end.
        !hasAskedAboutNotifications(context) -> promise.resolve("not_asked")
        else -> promise.resolve("permanently_denied")
      }
    }

    // Deliberately does NOT report the user's answer — see the JS wrapper, which
    // re-reads getNotificationPermission() once the app resumes.
    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        promise.reject(
          "NO_RUNTIME_DIALOG",
          "Android 12 and older have no notification permission to grant; enable " +
            "notifications from the app's Settings page instead.",
          null,
        )
        return@AsyncFunction
      }
      val activity = appContext.currentActivity ?: run {
        promise.reject("NO_ACTIVITY", "No foreground activity to show the dialog.", null)
        return@AsyncFunction
      }
      val enabled =
        activity.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled()
          ?: false
      if (enabled) {
        promise.resolve(null) // already granted — don't pause the app for nothing
        return@AsyncFunction
      }
      markNotificationsAsked(context)
      try {
        // Framework API 23+; the result arrives as an activity result we don't
        // need, because the authoritative state is re-read afterwards.
        activity.requestPermissions(
          arrayOf(Manifest.permission.POST_NOTIFICATIONS),
          NOTIFICATION_PERMISSION_REQUEST,
        )
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("REQUEST_FAILED", "Android refused to show the dialog: ${e.message}", e)
      }
    }

    // The documented escape hatch for every permanently-denied case (notifications
    // included) — required so the consent flow has no dead end.
    AsyncFunction("openAppSettings") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      try {
        context.startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        promise.resolve(null)
      } catch (e: ActivityNotFoundException) {
        promise.reject(
          "APP_SETTINGS_UNAVAILABLE",
          "This device exposes no per-app Settings screen for Spot.",
          e,
        )
      }
    }

    // ---- Stage 6: OEM battery onboarding ---------------------------------------
    // Facts only. The wording lives in JS (src/app/settings.tsx) so it can be reworded
    // without a native rebuild, and every field here is a question the UI has to ask:
    // which vendor is this, is the tunnel already exempt, and is there a vendor
    // autostart screen we could open (MIUI/ColorOS/FuntouchOS all have one, most
    // others do not).
    AsyncFunction("getBatteryOptimizationStatus") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      val autostart = OemBatteryHelper.findAutostartScreen(context)
      promise.resolve(
        mapOf(
          "vendor" to OemBatteryHelper.vendorKey(),
          "manufacturer" to Build.MANUFACTURER,
          "brand" to Build.BRAND,
          "model" to Build.MODEL,
          "sdkInt" to Build.VERSION.SDK_INT,
          "aggressiveVendor" to OemBatteryHelper.isAggressiveVendor(),
          "ignoringBatteryOptimizations" to OemBatteryHelper.isIgnoringBatteryOptimizations(context),
          "autostartAvailable" to (autostart != null),
          "autostartScreen" to autostart?.flattenToShortString(),
        ),
      )
    }

    // Resolves true when the direct exemption dialog opened, false when the fallback
    // list screen did — the UI has to say different things about those two.
    AsyncFunction("requestIgnoreBatteryOptimizations") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      try {
        promise.resolve(OemBatteryHelper.requestIgnoreBatteryOptimizations(context))
      } catch (e: Exception) {
        promise.reject(
          "BATTERY_SETTINGS_UNAVAILABLE",
          "This device exposes no battery-optimization screen; whitelist Spot manually " +
            "under Settings > Battery.",
          e,
        )
      }
    }

    // Resolves the screen that opened, or null when this device has none. Null is a
    // normal answer, not an error: the UI shows written instructions instead.
    AsyncFunction("openAutostartSettings") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      promise.resolve(OemBatteryHelper.openAutostartSettings(context)?.flattenToShortString())
    }

    // ---- Stage 7: data usage ----------------------------------------------------
    // `window` is "today" or "week" (anything else is read as "today"); `packages` are
    // extra candidates the UI cares about (allow-list, foreground app). Native adds the
    // ones it knows were blocked. Cost is one binder round-trip per uid, so the list is
    // a capped sample, never a full device census.
    AsyncFunction("getDataUsage") { window: String, packages: List<String>, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context is not available.", null)
        return@AsyncFunction
      }
      val now = System.currentTimeMillis()
      val week = window == "week"
      val start = if (week) now - WEEK_MS else NetworkStatsReader.startOfToday(now)
      val running = VpnFirewallService.isRunning()
      val hasUsageAccess = ForegroundAppWatcher.hasUsageAccess(context)
      val pm = context.packageManager

      // Passed `running`: with the tunnel down, nothing can be blocked, and an interval
      // left open by a hard process kill must not be read as "blocked the whole time".
      val blocked = BlockLogStore.blockedMillis(context, start, now, running)

      // Priority order: apps we have blocked-time for (the interesting ones), then
      // whatever the UI asked about, then ourselves.
      val wanted = LinkedHashSet<String>()
      wanted.addAll(blocked.keys)
      packages.forEach { pkg -> if (pkg.isNotBlank()) wanted.add(pkg.trim()) }
      wanted.add(context.packageName)

      val uidByPackage = HashMap<String, Int>()
      val packageByUid = HashMap<Int, String>()
      for (pkg in wanted) {
        if (uidByPackage.size >= MAX_UIDS) break
        try {
          val info = pm.getApplicationInfo(pkg, 0)
          uidByPackage[pkg] = info.uid
          packageByUid[info.uid] = pkg
        } catch (e: PackageManager.NameNotFoundException) {
          // Uninstalled mid-session: nothing to measure, not an error.
        }
      }

      val bytes =
        if (hasUsageAccess) {
          NetworkStatsReader.bytesByUid(context, packageByUid.keys.toList(), start, now)
        } else {
          emptyMap()
        }

      val apps =
        uidByPackage
          .mapNotNull { (pkg, uid) ->
            val used = bytes[uid] ?: 0L
            val blockedMs = blocked[pkg]
            // Nothing used and never tracked means "no answer for this app", reported by
            // omission rather than as an idle zero.
            if (used == 0L && blockedMs == null) return@mapNotNull null
            mapOf<String, Any?>(
              "packageName" to pkg,
              "label" to ForegroundAppWatcher.foregroundLabel(context, pkg),
              "bytes" to used.toDouble(),
              // null, not 0: "not tracked" and "known to be unblocked" are different.
              "blockedMillis" to blockedMs?.toDouble(),
            )
          }
          // Long -> Double on the way out: JS numbers are doubles, and bytes fit exactly
          // up to 2^53, so this avoids depending on Long conversion in the bridge.
          .sortedByDescending { entry -> entry["bytes"] as Double }
          .take(MAX_APPS)

      promise.resolve(
        mapOf<String, Any?>(
          "window" to if (week) "week" else "today",
          "windowStart" to start.toDouble(),
          "windowEnd" to now.toDouble(),
          "hasUsageAccess" to hasUsageAccess,
          "running" to running,
          // Stage 9: whether the WireGuard tunnel (not just the sinkhole) is up, so the
          // dashboard can label the mode it is reporting on.
          "vpnRunning" to VpnFirewallService.isVpnRunning(),
          "mobileBytes" to NetworkStatsReader.deviceMobileBytes(context, start, now)?.toDouble(),
          "droppedBytes" to NetworkStatsReader.droppedBytes(context, start, now).toDouble(),
          "apps" to apps,
        ),
      )
    }
  }

  // Android's own "the dialog was already tried" bookkeeping, kept natively so it
  // agrees with the OS rationale rule across restarts instead of living in JS
  // memory that a dev reload wipes.
  private fun hasAskedAboutNotifications(context: Context): Boolean =
    context
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getBoolean(PREF_NOTIFICATIONS_ASKED, false)

  private fun markNotificationsAsked(context: Context) {
    context
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(PREF_NOTIFICATIONS_ASKED, true)
      .apply()
  }

  companion object {
    private const val VPN_CONSENT_REQUEST = 9001
    private const val NOTIFICATION_PERMISSION_REQUEST = 9002
    private const val EVENT_NAME = "VpnFirewallEvents"
    private const val PREFS = "vpn_firewall"
    private const val PREF_NOTIFICATIONS_ASKED = "notifications_asked"
    private const val EXTRA_ALWAYS_ALLOWED = VpnFirewallService.EXTRA_ALWAYS_ALLOWED
    private const val EXTRA_VPN_CONFIG = VpnFirewallService.EXTRA_VPN_CONFIG

    // Stage 7: each uid is one binder round-trip, and the report is capped at what a
    // dashboard can show anyway.
    private const val MAX_UIDS = 60
    private const val MAX_APPS = 25
    private const val WEEK_MS = 7 * 24 * 60 * 60 * 1000L
  }
}
