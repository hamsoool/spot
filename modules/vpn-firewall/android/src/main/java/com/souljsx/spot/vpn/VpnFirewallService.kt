package com.souljsx.spot.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import com.souljsx.spot.vpn.tunnel.TunnelClient
import com.souljsx.spot.vpn.tunnel.TunnelConfig
import com.souljsx.spot.vpn.tunnel.WireGuardTunnelClient
import com.wireguard.android.backend.GoBackend
import java.io.FileInputStream
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

// Stage 2: local firewall / sinkhole mode. Captured (non-bypassing) apps have
// their TUN traffic read-and-discarded — never forwarded — so their sockets
// time out. That IS the block; no TCP/IP stack, NAT, or packet parsing.
// Stage 3: the bypass set is now dynamic — always-allowed apps plus whichever
// app is currently in the foreground, driven by ForegroundAppWatcher.
// Builder config is immutable once establish()ed: changing the bypass set means
// establishing a new interface and then closing the old descriptor (the new
// establish() already deactivates the previous interface, so no traffic is left
// un-captured in between).
// Stage 9: the same service also hosts the WireGuard tunnel, so it extends
// GoBackend.VpnService (the WireGuard library's own VpnService subclass) instead
// of android.net.VpnService. Facts this relies on, read from the library source:
//  * GoBackend.setState(UP, config) calls getBuilder() on this instance and applies
//    the config's ExcludedApplications through addDisallowedApplication — the same
//    bypass set the sinkhole uses, so the per-app gate is identical in both modes.
//  * `setBlocking(true)` there only puts the TUN file descriptor in blocking mode
//    (AOSP Builder#setBlocking); it does not block disallowed apps.
//  * The library protects its own sockets, and on tunnel DOWN it calls stopSelf().
//    stopSelf() is overridden below so a mode switch can absorb that call and keep
//    running instead of dying with the tunnel.
class VpnFirewallService : GoBackend.VpnService() {

  private var tunInterface: ParcelFileDescriptor? = null
  private var readerThread: Thread? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  // Bypass = apps that keep their own network path. Android's Builder calls
  // these "disallowed" (disallowed from the tunnel); everything else is
  // captured and sinkholed. Do not confuse the two names.
  private var alwaysAllowed: List<String> = emptyList()
  private var foregroundPackage: String? = null
  private var appliedBypass: List<String> = emptyList()
  private var watcher: ForegroundAppWatcher? = null

  // --- Stage 9: VPN tunnel mode ----------------------------------------------

  /** Null until the first VPN-mode start; one client per service instance. */
  private var tunnelClient: WireGuardTunnelClient? = null

  /** Last provisioned config, kept so a bypass-set change can re-apply it. */
  private var tunnelConfig: TunnelConfig? = null

  /**
   * Set immediately before a deliberate tunnel disconnect. GoBackend's DOWN path calls
   * stopSelf() on this service; without absorbing that call the service would die during a
   * mode switch and take the firewall down with it. See the stopSelf() override.
   */
  private var suppressNextStopSelf = false

  // establish() and the library's DNS retry loop both block, so tunnel work never runs on
  // the main thread (plan §5). A single thread also serialises connect/disconnect updates.
  private val tunnelExecutor = Executors.newSingleThreadExecutor()

  // Stage 7: bytes read off the TUN and discarded since the last flush. Incremented by
  // the reader thread only, then persisted on a throttle so an OS restart does not lose
  // the day's figure. Every one of these bytes never reached the radio — that is the
  // number the dashboard is entitled to call "saved".
  private val droppedBytes = AtomicLong(0)
  private var lastDroppedFlush = 0L
  private var lastStatsEmit = 0L

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // First thing, before any other work: Android throws
    // ForegroundServiceDidNotStartInTimeException if this is delayed.
    // Stage 4 audit against targetSdk 36: the manifest declares
    // foregroundServiceType="specialUse" plus FOREGROUND_SERVICE_SPECIAL_USE,
    // which is the combination Android 14+ demands for a VpnService that is not
    // a media/health/data-sync case; specialUse is also exempt from the
    // time-limited FGS rules Android 15 added for dataSync/mediaProcessing.
    // A missing runtime grant of POST_NOTIFICATIONS does NOT make this throw —
    // the service runs and only the notification stays hidden, which is why the
    // UI has to state that trade-off instead of assuming the user is warned.
    try {
      startForeground(NOTIFICATION_ID, buildNotification())
    } catch (e: Exception) {
      // Usually SecurityException (an OEM stripped the FGS permission). Dying
      // quietly with an event beats letting the exception escape and crashing
      // the whole app on a background restart.
      FirewallEvents.emit(
        "stateChanged",
        mapOf(
          "running" to false,
          "error" to "Android refused the foreground service (${e.javaClass.simpleName})",
        ),
      )
      stopSelf()
      return START_NOT_STICKY
    }

    // A START_STICKY redelivery arrives with a null intent, and after a *process* death the
    // replacement instance has no fields left either — so the allow-list has to come off disk.
    // Without that, the firewall silently returns exempting nothing and sinkholes exactly the
    // apps the user chose to keep online.
    val allowed = intent?.getStringArrayListExtra(EXTRA_ALWAYS_ALLOWED)?.toList()
    if (allowed != null) {
      alwaysAllowed = allowed
      persistAlwaysAllowed(this, allowed)
    } else if (alwaysAllowed.isEmpty()) {
      alwaysAllowed = persistedAlwaysAllowed(this)
    }

    // Stage 9: a JSON TunnelConfig in the intent means "VPN mode"; a fresh intent without one
    // while a tunnel is up means the user turned VPN mode off, and neither means the sinkhole.
    // Both modes share this service, the watcher, the bypass set and the notification — only
    // the interface owner differs.
    val vpnJson = intent?.getStringExtra(EXTRA_VPN_CONFIG)
    if (vpnJson != null && vpnJson.isNotBlank()) {
      startVpnMode(vpnJson)
    } else if (intent != null && tunnelClient?.isConnected() == true) {
      stopVpnMode()
    } else {
      applyBypass()
    }
    startWatcher()
    return START_STICKY
  }

  /**
   * GoBackend's tunnel-DOWN path calls stopSelf() on this service. A deliberate mode switch
   * sets [suppressNextStopSelf] first so that call does not kill the firewall along with the
   * tunnel; every other stop path (user turned protection off, Android reclaiming memory)
   * passes through untouched.
   */
  override fun stopSelf() {
    if (suppressNextStopSelf) {
      suppressNextStopSelf = false
      return
    }
    super.stopSelf()
  }

  // System revoked VPN consent (user tapped the key icon, another VPN started).
  override fun onRevoke() {
    stopSelf()
    super.onRevoke()
  }

  // Kept for programmatic updates; in practice the module re-sends the intent,
  // which lands in onStartCommand and calls applyBypass() itself.
  fun updateAlwaysAllowed(packages: List<String>) {
    alwaysAllowed = packages
    applyBypass()
  }

  private fun startWatcher() {
    if (watcher != null) return
    watcher =
      ForegroundAppWatcher(
        context = this,
        onForegroundChanged = { pkg -> mainHandler.post { handleForegroundChange(pkg) } },
        onWatchingChanged = { watching ->
          mainHandler.post { FirewallEvents.emit("stateChanged", mapOf("watching" to watching)) }
        },
      ).also { it.start() }
  }

  // Parameter deliberately not called packageName: Context.packageName (our own
  // id) is what applyBypass() unions in, and shadowing it here invites a bug.
  private fun handleForegroundChange(pkg: String?) {
    if (pkg == foregroundPackage) return
    foregroundPackage = pkg
    if (tunnelClient?.isConnected() == true) {
      // VPN mode: the bypass set lives inside the tunnel's ExcludedApplications, so the
      // change is applied by re-establishing the tunnel instead of by the sinkhole.
      reapplyTunnelBypass()
    } else {
      applyBypass()
    }
    FirewallEvents.emit(
      "foregroundAppChanged",
      mapOf(
        "packageName" to pkg,
        "label" to ForegroundAppWatcher.foregroundLabel(this, pkg),
      ),
    )
  }

  // Dedupe here: re-establishing drops in-flight sockets for every app that is
  // not in the bypass set, so it must run once per real change and never on a
  // redundant tick. A failed update leaves the previous policy in force.
  private fun applyBypass() {
    val bypass = (alwaysAllowed + listOfNotNull(foregroundPackage, packageName)).distinct()
    if (bypass == appliedBypass) return
    if (establishInterface(bypass)) {
      appliedBypass = bypass
      // Stage 7 bookkeeping: this set is what "allowed" means from this instant on, and
      // everything outside it is captured and blocked. Recorded here rather than in the
      // watcher so the two can never disagree about what was applied.
      BlockLogStore.syncBypass(this, bypass, System.currentTimeMillis())
      updateNotification()
    }
  }

  // --- Stage 9: VPN mode -----------------------------------------------------

  /** START: parse the provisioned config and hand it to a fresh WireGuard client. */
  private fun startVpnMode(configJson: String) {
    val parsed =
      try {
        TunnelConfig.fromJson(configJson)
      } catch (e: Exception) {
        FirewallEvents.emit(
          "stateChanged",
          mapOf(
            "running" to true,
            "vpn" to false,
            "error" to (e.message ?: "Invalid tunnel config"),
          ),
        )
        return
      }

    tunnelConfig = parsed
    // Nothing is sinkholed once the tunnel owns captured traffic, so close any interval the
    // block log left open — otherwise those minutes read as "blocked" while they were relayed.
    BlockLogStore.closeAll(this, System.currentTimeMillis())

    val client =
      tunnelClient
        ?: WireGuardTunnelClient(this).also { created ->
          created.setListener(
            object : TunnelClient.Listener {
              override fun onTunnelStateChanged(connected: Boolean, error: String?) {
                mainHandler.post { onTunnelStateChanged(connected, error) }
              }
            }
          )
          tunnelClient = created
        }

    val excluded = currentBypass()
    tunnelExecutor.execute { client.connect(parsed.withExcludedApplications(excluded)) }
  }

  /** Mode switch back to the sinkhole: drop the tunnel, then re-establish our own interface. */
  private fun stopVpnMode() {
    val client = tunnelClient ?: return
    tunnelExecutor.execute {
      // Absorb the library's stopSelf() so this service survives and can bring the sinkhole
      // interface up immediately after the tunnel is gone.
      suppressNextStopSelf = true
      client.disconnect()
      mainHandler.post {
        if (tunnelClient?.isConnected() != true) {
          // Force applyBypass() past its no-change guard: no interface is up right now.
          appliedBypass = emptyList()
          applyBypass()
        }
      }
    }
  }

  /** Foreground change while tunneled: same bypass semantics, new ExcludedApplications. */
  private fun reapplyTunnelBypass() {
    val client = tunnelClient ?: return
    val excluded = currentBypass()
    tunnelExecutor.execute { client.updateExcludedApplications(excluded) }
  }

  /** The one definition of "allowed": always-allowed + foreground + this app. */
  private fun currentBypass(): List<String> =
    (alwaysAllowed + listOfNotNull(foregroundPackage, packageName)).distinct()

  private fun onTunnelStateChanged(connected: Boolean, error: String?) {
    updateNotification()
    val payload = mutableMapOf<String, Any?>("running" to true, "vpn" to connected)
    if (error != null) payload["error"] = error
    FirewallEvents.emit("stateChanged", payload)
  }

  // Returns true when the new policy is live on the interface.
  private fun establishInterface(bypassPackages: List<String>): Boolean {
    val builder =
      Builder()
        .setSession("DataOptimizerFirewall")
        .addAddress("10.0.0.2", 32)
        .addRoute("0.0.0.0", 0)
        .addDnsServer("1.1.1.1")
        .setMtu(1500)

    // A package that cannot be exempted stays captured, i.e. blocked — the opposite of what
    // the user asked for. Skipping it is correct (an uninstall must never crash the tunnel),
    // but the count has to reach JS or a stale allow-list fails silently.
    var unexempted = 0
    bypassPackages.forEach { pkg ->
      try {
        builder.addDisallowedApplication(pkg)
      } catch (e: PackageManager.NameNotFoundException) {
        unexempted++
      }
    }

    // establish() returns null when another VPN app won the race or consent was
    // revoked, and throws IllegalArgumentException (bad parameter),
    // IllegalStateException (rejected parameter / binder failure) or
    // SecurityException (service mis-declared in the manifest). Android exposes
    // no probe for "a protected VPN already owns the interface", so the guard is
    // to contain every outcome here instead of letting one kill the process.
    val attempt: Pair<ParcelFileDescriptor?, String?> =
      try {
        Pair(builder.establish(), null)
      } catch (e: RuntimeException) {
        Pair(null, e.message ?: e.javaClass.simpleName)
      }

    val descriptor = attempt.first
    if (descriptor == null) {
      val reason = attempt.second ?: "VPN_NOT_PREPARED"
      if (tunInterface == null) {
        // Nothing is captured and nothing can be: report and stand down.
        FirewallEvents.emit("stateChanged", mapOf("running" to false, "error" to reason))
        stopSelf()
      } else {
        // The old interface was never closed, so the previous policy still
        // holds — tell JS the update failed without claiming we stopped.
        FirewallEvents.emit("stateChanged", mapOf("error" to reason))
      }
      return false
    }

    // establish() has already deactivated the previous interface, so closing the
    // old descriptor only now keeps the swap free of a fail-open window.
    closeInterface()
    tunInterface = descriptor
    startSinkholeReader()
    if (unexempted > 0) {
      // The interface is up, so this is not a stop — but "allowed" apps are still being
      // captured, and the UI has to say so instead of reporting a clean run.
      FirewallEvents.emit(
        "stateChanged",
        mapOf(
          "error" to "$unexempted allowed app(s) could not be exempted and remain blocked"
        ),
      )
    }
    return true
  }

  private fun startSinkholeReader() {
    val fd = tunInterface ?: return
    readerThread =
      Thread {
          val input = FileInputStream(fd.fileDescriptor)
          val buffer = ByteArray(32767)
          try {
            while (!Thread.currentThread().isInterrupted) {
              val read = input.read(buffer) // read-and-discard: the block
              if (read > 0) onBytesDropped(read)
            }
          } catch (e: IOException) {
            // Expected during establish() churn — interface was torn down.
          } finally {
            // Leaving the interface: count whatever is still in memory before the
            // thread dies, or the last few seconds of a session are lost.
            flushDroppedBytes()
          }
        }
        .apply { start() }
  }

  private fun onBytesDropped(bytes: Int) {
    droppedBytes.addAndGet(bytes.toLong())
    val now = System.currentTimeMillis()
    if (now - lastDroppedFlush < FLUSH_INTERVAL_MS) return
    lastDroppedFlush = now
    flushDroppedBytes()
    if (now - lastStatsEmit >= STATS_EMIT_INTERVAL_MS) {
      lastStatsEmit = now
      emitDroppedStats()
    }
  }

  private fun flushDroppedBytes() {
    // getAndSet, not get: the reader thread and onDestroy can both land here, and a
    // plain read-then-reset would double-count the same bytes.
    val pending = droppedBytes.getAndSet(0)
    if (pending > 0) NetworkStatsReader.addDroppedBytes(this, pending)
  }

  // Lets an open dashboard update itself without polling. Deliberately coarse: this
  // costs a prefs read plus a bridge hop, and the tunnel can drop thousands of packets
  // per second.
  private fun emitDroppedStats() {
    val now = System.currentTimeMillis()
    val startOfToday = NetworkStatsReader.startOfToday(now)
    FirewallEvents.emit(
      "statsUpdated",
      mapOf(
        "droppedBytes" to NetworkStatsReader.droppedBytes(this, startOfToday, now).toDouble(),
        "windowStart" to startOfToday.toDouble(),
      ),
    )
  }

  // Notification text is capped at ~1024 bytes by the framework; show only the
  // one label that matters, never the whole app list.
  private fun buildNotification(): Notification {
    ensureNotificationChannel()
    val label = foregroundPackage?.let { ForegroundAppWatcher.foregroundLabel(this, it) }
    val tunnelActive = tunnelClient?.isConnected() == true
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(if (tunnelActive) "VPN + data saver" else "Data Saver firewall")
      .setContentText(
        when {
          tunnelActive && label != null -> "Tunnel on · allowed: $label"
          tunnelActive -> "Tunnel on. Only allowed apps can use mobile data."
          label != null -> "Allowed: $label"
          else -> "Only allowed apps can use mobile data."
        }
      )
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()
  }

  private fun updateNotification() {
    val manager = getSystemService(NotificationManager::class.java) ?: return
    manager.notify(NOTIFICATION_ID, buildNotification())
  }

  private fun ensureNotificationChannel() {
    val manager = getSystemService(NotificationManager::class.java) ?: return
    // Channels only exist from API 26; on 24/25 NotificationCompat ignores the
    // channel id, and touching the class there would fail at class-load.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    // Re-creating an existing channel is a documented no-op, so this is safe to
    // call on every build instead of tracking first-run order.
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Firewall", NotificationManager.IMPORTANCE_LOW)
    )
  }

  private fun closeInterface() {
    readerThread?.interrupt()
    readerThread = null
    try {
      tunInterface?.close()
    } catch (e: IOException) {
      // Already closed — nothing to do.
    }
    tunInterface = null
  }

  override fun onDestroy() {
    // Stage 9: drop the tunnel before the process tears down and absorb the library's
    // stopSelf() — the service is already going away, and re-entering stopSelf() here would
    // only race the framework. shutdown() (not shutdownNow) lets the queued teardown finish.
    suppressNextStopSelf = true
    tunnelExecutor.execute { tunnelClient?.disconnect() }
    tunnelClient = null
    tunnelConfig = null
    tunnelExecutor.shutdown()
    watcher?.stop()
    watcher = null
    mainHandler.removeCallbacksAndMessages(null)
    foregroundPackage = null
    appliedBypass = emptyList()
    closeInterface()
    // Stage 7: count whatever is still in memory, and leave no interval open — a stale
    // one would later be read as "blocked the whole time".
    flushDroppedBytes()
    BlockLogStore.closeAll(this, System.currentTimeMillis())
    instance = null
    // Android usually drops the notification together with the service, but a
    // stopService() that lands while a START_STICKY restart is pending can leave
    // a dead "firewall active" notice in the shade — remove it explicitly.
    // STOP_FOREGROUND_REMOVE is API 24, which is our minSdk.
    stopForeground(STOP_FOREGROUND_REMOVE)
    FirewallEvents.emit("stateChanged", mapOf("running" to false))
    super.onDestroy()
  }

  companion object {
    // Named for what JS actually sends. Android's Builder then inverts it via
    // addDisallowedApplication(): these packages are excluded from the tunnel,
    // i.e. they keep working; everyone else is captured and sinkholed.
    const val EXTRA_ALWAYS_ALLOWED = "extra_always_allowed_packages"

    /**
     * Stage 9: a JSON TunnelConfig (see TunnelConfig.fromJson). Present and non-blank = VPN
     * mode; a fresh intent without it while a tunnel is up = the user turned VPN mode off.
     */
    const val EXTRA_VPN_CONFIG = "extra_vpn_config"

    const val NOTIFICATION_ID = 1001
    private const val CHANNEL_ID = "vpn_firewall"

    // Persist dropped bytes every 5s (bounded prefs churn); tell JS no more often than
    // every 30s (a prefs read plus a bridge hop).
    private const val FLUSH_INTERVAL_MS = 5_000L
    private const val STATS_EMIT_INTERVAL_MS = 30_000L

    // Stage 7: whether the tunnel is up. Blocked-time bookkeeping is only meaningful
    // while it is, and the module uses this to close intervals left open by a hard
    // process kill (which never reaches onDestroy).
    @Volatile
    private var instance: VpnFirewallService? = null

    fun isRunning(): Boolean = instance != null

    /** Stage 9: true while the WireGuard tunnel (not just the sinkhole) is up. */
    fun isVpnRunning(): Boolean = instance?.tunnelClient?.isConnected() == true

    // The bypass list has to survive process death, not just intent loss: Android restarts a
    // START_STICKY service whenever it likes with a null intent, and a fresh instance holding
    // an empty list would keep the tunnel up while blocking the very apps the user allowed.
    // Same prefs file the module already uses, so there is one store and not two.
    private const val PREFS_FILE = "vpn_firewall"
    private const val PREF_ALWAYS_ALLOWED = "always_allowed_packages"

    fun persistAlwaysAllowed(context: Context, packages: List<String>) {
      context
        .getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
        .edit()
        .putStringSet(PREF_ALWAYS_ALLOWED, packages.toSet())
        .apply()
    }

    /** Empty means "no bypass", which is the safe reading of a first-run or cleared store. */
    fun persistedAlwaysAllowed(context: Context): List<String> {
      val stored =
        context
          .getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
          .getStringSet(PREF_ALWAYS_ALLOWED, emptySet())
      return stored?.filterNotNull()?.sorted() ?: emptyList()
    }
  }
}
