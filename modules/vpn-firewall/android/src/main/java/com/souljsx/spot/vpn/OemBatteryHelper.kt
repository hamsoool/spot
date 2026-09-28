package com.souljsx.spot.vpn

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import java.util.Locale

// Stage 6: OEM battery-manager onboarding.
//
// MIUI/HyperOS, ColorOS, FuntouchOS and friends kill background services far more
// aggressively than AOSP unless the app is whitelisted in a *vendor* settings
// screen that has no public API. Two consequences shape this file:
//  1. The vendor screens are reached by best-effort explicit intents; they can be
//     renamed or removed in any OTA, so every candidate is resolved before use and
//     "none found" is a normal result the UI must render as plain instructions
//     rather than as an error.
//  2. Facts only. The user-facing copy lives in JS (src/app/settings.tsx) so it can
//     be reworded/translated without a native rebuild; this returns what the device
//     actually is and what it actually supports.
object OemBatteryHelper {

  // "pkg/cls" shorthand parsed with ComponentName.unflattenFromString. Ordered
  // most-specific first; the first entry that resolves on this device wins.
  private val AUTOSTART_SCREENS: Map<String, List<String>> =
    mapOf(
      "xiaomi" to
        listOf(
          "com.miui.securitycenter/com.miui.permcenter.autostart.AutoStartManagementActivity",
          "com.miui.powerkeeper/com.miui.powerkeeper.ui.HiddenAppsConfigActivity",
        ),
      "huawei" to
        listOf(
          "com.huawei.systemmanager/.startupmgr.ui.StartupNormalAppListActivity",
          "com.huawei.systemmanager/.appcontrol.activity.StartupAppControlActivity",
          "com.huawei.systemmanager/.optimize.process.ProtectActivity",
        ),
      "oppo" to
        listOf(
          "com.coloros.safecenter/.permission.startup.StartupAppListActivity",
          "com.coloros.safecenter/.startupapp.StartupAppListActivity",
          "com.oppo.safe/.permission.startup.StartupAppListActivity",
          "com.oplus.safecenter/com.oplus.safecenter.startupapp.StartupAppListActivity",
        ),
      "vivo" to
        listOf(
          "com.vivo.permissionmanager/.activity.BgStartUpManagerActivity",
          "com.iqoo.secure/.ui.phoneoptimize.AddWhiteListActivity",
          "com.iqoo.secure/.safeguard.PurviewTabActivity",
        ),
      "samsung" to
        listOf(
          // One UI dropped the autostart list, but the battery screen is still where
          // users are told to whitelist an app, so it stays as the best target.
          "com.samsung.android.lool/com.samsung.android.sm.ui.battery.BatteryActivity",
          "com.samsung.android.sm/.ui.powerusage.BatteryActivity",
        ),
      "oneplus" to
        listOf(
          "com.oneplus.security/.chainlaunch.view.ChainLaunchAppListActivity",
          "com.coloros.safecenter/.startupapp.StartupAppListActivity",
        ),
      "asus" to listOf("com.asus.mobilemanager/com.asus.mobilemanager.powersaver.PowerSaverSettings"),
      "meizu" to listOf("com.meizu.safe/.permission.SmartBGActivity"),
      "letv" to listOf("com.letv.android.letvsafe/.AutobootManageActivity"),
    )

  /** Build.MANUFACTURER/BRAND are declared non-null but OEMs have shipped nulls. */
  private fun normalizedManufacturer(): String =
    (Build.MANUFACTURER ?: "").trim().lowercase(Locale.US)

  private fun normalizedBrand(): String = (Build.BRAND ?: "").trim().lowercase(Locale.US)

  /** Manufacturer if we have guidance for it, else brand, else null. */
  fun vendorKey(): String? {
    val manufacturer = normalizedManufacturer()
    if (AUTOSTART_SCREENS.containsKey(manufacturer)) return manufacturer
    val brand = normalizedBrand()
    return if (AUTOSTART_SCREENS.containsKey(brand)) brand else null
  }

  fun isAggressiveVendor(): Boolean = vendorKey() != null

  fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
    // API 23+, our minSdk, so no version guard is needed.
    return power.isIgnoringBatteryOptimizations(context.packageName)
  }

  /** First vendor autostart screen this device actually resolves, if any. */
  fun findAutostartScreen(context: Context): ComponentName? {
    val key = vendorKey() ?: return null
    val candidates = AUTOSTART_SCREENS[key] ?: return null
    for (candidate in candidates) {
      val component = ComponentName.unflattenFromString(candidate) ?: continue
      val intent = Intent().setComponent(component)
      // resolveActivity() is how "installed" is told apart from "renamed by the last
      // OTA". Package visibility is unrestricted here: the module manifest already
      // declares QUERY_ALL_PACKAGES.
      val resolved =
        try {
          context.packageManager.resolveActivity(intent, 0)
        } catch (e: Exception) {
          null
        }
      if (resolved != null) return component
    }
    return null
  }

  /**
   * Opens the vendor autostart list and returns the screen that was launched, or null
   * when this device exposes none — the caller then shows plain instructions instead
   * of a dead button.
   */
  fun openAutostartSettings(context: Context): ComponentName? {
    val component = findAutostartScreen(context) ?: return null
    return try {
      context.startActivity(
        Intent()
          .setComponent(component)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
      component
    } catch (e: Exception) {
      // It resolved a moment ago but startActivity still refused (not exported, or a
      // vendor permission check). Treat exactly like "no screen".
      null
    }
  }

  /**
   * Doze/App-Standby exemption — the one part of this file with a documented,
   * AOSP-wide API. The direct request dialog needs REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
   * in the manifest; the plain list screen does not, so it is the fallback. Returns
   * true when the direct dialog was opened, false when the list was.
   */
  fun requestIgnoreBatteryOptimizations(context: Context): Boolean {
    val direct =
      Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        .setData(Uri.fromParts("package", context.packageName, null))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (context.packageManager.resolveActivity(direct, 0) != null) {
      context.startActivity(direct)
      return true
    }
    context.startActivity(
      Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
    return false
  }
}
