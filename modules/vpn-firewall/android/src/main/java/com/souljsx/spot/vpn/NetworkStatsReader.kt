package com.souljsx.spot.vpn

import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.content.Context
import android.net.ConnectivityManager
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

// Stage 7: the numbers behind the dashboard, from two deliberately separate sources.
//
//  * The OS (NetworkStatsManager) knows exactly how many bytes a uid moved, but it
//    only answers when Usage Access is granted, and it can never say *why* an app
//    moved none.
//  * The sinkhole reader in VpnFirewallService knows exactly how many bytes were
//    captured and thrown away. That counter is ours; it is the honest "saved"
//    figure, because every byte counted there is a byte that never left the radio.
//
// Mobile only (TYPE_MOBILE): the product is a mobile-data saver, and folding wifi
// into the same total would make "saved" meaningless.
//
// API facts verified against the android-28 SDK stub sources, not memory:
//   querySummaryForDevice(int, String, long, long) -> NetworkStats.Bucket (nullable,
//     documented "null if permissions are insufficient"), subscriberId null = all.
//   queryDetailsForUid(int, String, long, long, int) -> NetworkStats (SecurityException
//     without the grant; it is a checked-exception signature in Java, i.e. no Kotlin
//     handling requirement, but the runtime throw is caught below).
//   NetworkStats.hasNextBucket()/getNextBucket(Bucket) -> boolean; getNextBucket fills
//     the caller's Bucket, exactly like UsageEvents.
//   NetworkStats implements AutoCloseable with a public close().
object NetworkStatsReader {

  // ConnectivityManager.TYPE_MOBILE. Deprecated in API 28 in favour of
  // NetworkCapabilities, but NetworkStatsManager still takes the legacy int.
  @Suppress("DEPRECATION") private const val NETWORK_TYPE = ConnectivityManager.TYPE_MOBILE

  private const val DROPPED_PREFIX = "dropped_bytes_"
  private const val PREFS_FILE = "vpn_firewall"
  private const val MAX_TRACKED_DAYS = 32

  // yyyyMMdd in the device's own zone: "today" must mean the user's today. Not
  // thread-safe, so every use below is inside a synchronized block.
  private val dayFormat = SimpleDateFormat("yyyyMMdd", Locale.US)
  private val lock = Any()

  /** Day bucket key for a wall-clock timestamp, e.g. "20260928". */
  fun dayKeyFor(millis: Long): String = synchronized(lock) { dayFormat.format(Date(millis)) }

  /**
   * Inclusive list of day keys from [start] to [end], oldest first. Calendar-based
   * rather than millis arithmetic so a DST change cannot skip or double a day.
   */
  fun dayKeysBetween(start: Long, end: Long): List<String> {
    if (end < start) return emptyList()
    synchronized(lock) {
      val cal = Calendar.getInstance()
      cal.timeInMillis = start
      startOfDay(cal)
      val keys = ArrayList<String>(8)
      while (cal.timeInMillis <= end && keys.size < MAX_TRACKED_DAYS) {
        keys.add(dayFormat.format(Date(cal.timeInMillis)))
        cal.add(Calendar.DAY_OF_YEAR, 1)
      }
      return keys
    }
  }

  /** Local midnight of the day containing [millis] — the start of a "today" window. */
  fun startOfToday(millis: Long): Long {
    val cal = Calendar.getInstance()
    cal.timeInMillis = millis
    synchronized(lock) { startOfDay(cal) }
    return cal.timeInMillis
  }

  private fun startOfDay(cal: Calendar) {
    cal.set(Calendar.HOUR_OF_DAY, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
  }

  private fun manager(context: Context): NetworkStatsManager? =
    context.getSystemService(Context.NETWORK_STATS_SERVICE) as? NetworkStatsManager

  /**
   * Device-wide mobile bytes (rx+tx) over [start, end]. Null when the OS refuses to
   * answer — no Usage Access grant, an OEM stub NetworkStatsService, or a dead
   * binder. Null is kept distinct from 0 on purpose: the UI must say "unavailable"
   * rather than "you used nothing".
   */
  fun deviceMobileBytes(context: Context, start: Long, end: Long): Long? {
    val stats = manager(context) ?: return null
    return try {
      // subscriberId = null is the documented "all subscribers" form, which is what a
      // device total means here. The javadoc notes this can return null.
      val bucket = stats.querySummaryForDevice(NETWORK_TYPE, null, start, end) ?: return null
      bucket.rxBytes + bucket.txBytes
    } catch (e: SecurityException) {
      null
    } catch (e: Exception) {
      // RemoteException / IllegalStateException: "no answer", never zero.
      null
    }
  }

  /**
   * Per-uid mobile bytes over [start, end]. One binder round-trip per uid, so the
   * caller caps the list (MAX_UIDS in the module). Failures are per-uid and never
   * propagate: an app uninstalled mid-window is routine, not an error.
   */
  fun bytesByUid(context: Context, uids: List<Int>, start: Long, end: Long): Map<Int, Long> {
    val stats = manager(context) ?: return emptyMap()
    val out = HashMap<Int, Long>()
    for (uid in uids.distinct()) {
      try {
        val detail = stats.queryDetailsForUid(NETWORK_TYPE, null, start, end, uid) ?: continue
        try {
          var total = 0L
          val bucket = NetworkStats.Bucket()
          while (detail.hasNextBucket()) {
            // getNextBucket fills the instance we hand it and reports whether it did;
            // there is no allocate-per-bucket overload.
            detail.getNextBucket(bucket)
            total += bucket.rxBytes + bucket.txBytes
          }
          if (total > 0) out[uid] = total
        } finally {
          runCatching { detail.close() }
        }
      } catch (e: Exception) {
        // SecurityException (grant revoked mid-loop) or a dead binder — skip this uid.
      }
    }
    return out
  }

  // ---- our own counter: bytes captured and thrown away ------------------------
  //
  // Persisted per calendar day rather than kept in memory: the OS kills and restarts
  // the service routinely, and a "saved today" figure that resets on every restart
  // would be worse than useless. The sinkhole reader flushes this on a throttle, so
  // it never runs per packet.
  fun addDroppedBytes(context: Context, delta: Long) {
    if (delta <= 0) return
    synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
      val key = DROPPED_PREFIX + dayFormat.format(Date(System.currentTimeMillis()))
      prefs.edit().putLong(key, prefs.getLong(key, 0L) + delta).apply()
      prune(prefs)
    }
  }

  /** Bytes the sinkhole discarded over [start, end]; 0 when nothing was ever counted. */
  fun droppedBytes(context: Context, start: Long, end: Long): Long {
    val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
    var total = 0L
    for (key in dayKeysBetween(start, end)) total += prefs.getLong(DROPPED_PREFIX + key, 0L)
    return total
  }

  // Bounds the prefs file: retention only has to cover the widest dashboard window
  // (a week) plus room for clock skew.
  private fun prune(prefs: android.content.SharedPreferences) {
    val cutoff = dayFormat.format(Date(System.currentTimeMillis() - MAX_TRACKED_DAYS * 86400000L))
    for (key in prefs.all.keys.toList()) {
      if (!key.startsWith(DROPPED_PREFIX)) continue
      if (key.removePrefix(DROPPED_PREFIX) < cutoff) prefs.edit().remove(key).apply()
    }
  }
}
