package com.souljsx.spot.vpn

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.os.SystemClock

// Watches foreground-app transitions via UsageStatsManager queryEvents.
// Requires the special-access "Usage Access" permission (no runtime dialog);
// when it is not granted the watcher simply reports watching=false and the
// service keeps the static bypass set â€” it retries automatically every tick,
// so granting in Settings while the firewall runs picks up without a restart.
//
// Threading: one dedicated poll thread; onForegroundChanged is invoked on it,
// and must only read state or post to a Handler (VpnFirewallService does).
class ForegroundAppWatcher(
  context: Context,
  private val onForegroundChanged: (packageName: String?) -> Unit,
  private val onWatchingChanged: (Boolean) -> Unit,
) {

  private val appContext = context.applicationContext
  private val usageStatsManager =
    appContext.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager

  @Volatile
  private var thread: Thread? = null

  // State touched only by the poll thread. queryEvents() is wall-clock based,
  // so its window uses currentTimeMillis(); the debounce uses elapsedRealtime()
  // so a user changing the system clock cannot stall or spam a re-establish.
  private var lastKnownForeground: String? = null
  private var candidate: String? = null
  private var candidateSetAt = 0L
  private var lastQueryWallClock = 0L
  private var watching = false

  fun start() {
    if (thread != null) return
    lastQueryWallClock = System.currentTimeMillis() - INITIAL_SCAN_WINDOW_MS
    thread =
      Thread { pollLoop() }
        .apply {
          name = "foreground-app-watcher"
          start()
        }
  }

  fun stop() {
    thread?.interrupt()
    thread = null
  }

  private fun pollLoop() {
    while (!Thread.currentThread().isInterrupted) {
      try {
        tick()
      } catch (e: Exception) {
        // Permission revoked mid-query surfaces here on some OEMs; the next
        // tick re-checks watching state, so log-and-continue is safe.
      }
      try {
        Thread.sleep(POLL_INTERVAL_MS)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        break
      }
    }
  }

  private fun tick() {
    val granted = hasUsageAccess(appContext)
    if (granted != watching) {
      watching = granted
      onWatchingChanged(granted)
    }
    if (!granted) {
      // Static mode: let the always-allowed set be the whole truth. The loop
      // keeps polling, so granting Usage Access resumes watching by itself.
      if (lastKnownForeground != null) {
        lastKnownForeground = null
        candidate = null
        onForegroundChanged(null)
      }
      return
    }

    val now = System.currentTimeMillis()
    val events = usageStatsManager?.queryEvents(lastQueryWallClock, now) ?: return
    lastQueryWallClock = now
    val observedAt = SystemClock.elapsedRealtime()
    // UsageEvents exposes no no-arg getNextEvent(): the platform method is
    // `boolean getNextEvent(Event outEvent)` and writes into the instance we
    // hand it, so a single Event is allocated here and refilled per iteration.
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      when (event.eventType) {
        MOVE_TO_FOREGROUND -> {
          candidate = event.packageName
          candidateSetAt = observedAt
        }
        // Backgrounding the app we believed was foreground means "nothing" is
        // foreground (launcher, shade, recents) until the next MOVE_TO_FOREGROUND.
        MOVE_TO_BACKGROUND ->
          if (event.packageName == (candidate ?: lastKnownForeground)) {
            candidate = null
            candidateSetAt = observedAt
          }
      }
    }

    // Debounce: apply the candidate only once it has been quiet for
    // DEBOUNCE_MS, so flicking through recents causes one re-establish, not N.
    if (candidate != lastKnownForeground &&
      observedAt - candidateSetAt >= DEBOUNCE_MS) {
      lastKnownForeground = candidate
      onForegroundChanged(candidate)
    }
  }

  companion object {
    // UsageEvents.Event.MOVE_TO_FOREGROUND / MOVE_TO_BACKGROUND were replaced
    // by ACTIVITY_RESUMED / ACTIVITY_PAUSED in API 29 but are still emitted;
    // the numeric values are identical, so reference them literally.
    private const val MOVE_TO_FOREGROUND = 1
    private const val MOVE_TO_BACKGROUND = 2
    private const val POLL_INTERVAL_MS = 250L
    private const val DEBOUNCE_MS = 400L

    // First (re)scan window: long enough to find the MOVE_TO_FOREGROUND event
    // of an app that has been open for hours; the loop consumes it in one pass.
    private const val INITIAL_SCAN_WINDOW_MS = 6 * 60 * 60 * 1000L

    // Usage Access is a "special access" permission: there is no runtime dialog,
    // the AppOps mode is what Settings actually toggles, so it is the only
    // reliable source of truth. unsafeCheckOpNoThrow(String,...) is API 29+; the
    // deprecated String overload is the one that exists on our API 24 floor.
    @Suppress("DEPRECATION")
    fun hasUsageAccess(context: Context): Boolean {
      val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
        ?: return false
      val uid = Process.myUid()
      val mode =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, uid, context.packageName)
        } else {
          appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, uid, context.packageName)
        }
      return mode == AppOpsManager.MODE_ALLOWED
    }

    // Label for the current foreground package, for the JS event payload.
    fun foregroundLabel(context: Context, packageName: String?): String? {
      if (packageName == null) return null
      if (packageName == context.packageName) return "self"
      return try {
        val info = context.packageManager.getApplicationInfo(packageName, 0)
        context.packageManager.getApplicationLabel(info).toString()
      } catch (e: PackageManager.NameNotFoundException) {
        packageName // uninstalled mid-session â€” show the raw package rather than nothing
      }
    }
  }
}