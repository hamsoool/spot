package com.souljsx.spot.vpn

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject
import java.util.Calendar

// Stage 7 helper. The OS can say how many bytes an app moved; it can never say *why*
// an app moved none. This stores the missing half: which packages were captured by the
// tunnel (i.e. blocked) and for how long, bucketed per calendar day so the dashboard
// can answer "blocked for 2 h today".
//
// What it can and cannot know is deliberate. VpnFirewallService only ever hands over
// the *bypass* set, so a package is tracked from the first moment it appears there
// (allowed by the user, or foregrounded). A package that has never been allowed and
// never foregrounded is invisible here, and callers must report `blockedMillis: null`
// for it rather than a confident zero.
//
// Everything is behind one lock: the watcher/main thread writes, the JS thread reads.
object BlockLogStore {
  private const val PREFS_FILE = "vpn_firewall"
  private const val PREF_BUCKETS = "blocked_buckets"
  private const val PREF_OPEN = "blocked_open_since"
  private const val KEEP_DAYS = 32

  private val lock = Any()

  /** Called whenever the tunnel's bypass set changes (already debounced upstream). */
  fun syncBypass(context: Context, bypass: Collection<String>, now: Long) {
    synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
      val open = readOpen(prefs)
      val buckets = readBuckets(prefs)
      val wanted = bypass.toSet()
      var changed = false

      // Packages that left the bypass set are the ones that just became blocked.
      for (pkg in open.keys().asSequence().toList()) {
        if (wanted.contains(pkg)) continue
        addInterval(buckets, pkg, open.optLong(pkg, now), now)
        open.remove(pkg)
        changed = true
      }
      // Packages that entered it are now unblocked, so their interval opens here.
      for (pkg in wanted) {
        if (open.has(pkg)) continue
        open.put(pkg, now)
        changed = true
      }

      if (changed) write(prefs, buckets, open)
    }
  }

  /** The tunnel is going down: every open interval ends now. */
  fun closeAll(context: Context, now: Long) {
    synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
      val open = readOpen(prefs)
      if (open.length() == 0) return
      val buckets = readBuckets(prefs)
      for (pkg in open.keys().asSequence().toList()) {
        addInterval(buckets, pkg, open.optLong(pkg, now), now)
        open.remove(pkg)
      }
      write(prefs, buckets, open)
    }
  }

  /**
   * Blocked milliseconds per package over [windowStart, windowEnd]. Pass
   * `running = false` when the tunnel is down: a hard process kill never runs
   * onDestroy, and a stale open interval would inflate every later reading.
   */
  fun blockedMillis(
    context: Context,
    windowStart: Long,
    windowEnd: Long,
    running: Boolean,
  ): Map<String, Long> {
    if (!running) closeAll(context, minOf(windowEnd, System.currentTimeMillis()))

    val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
    val buckets = readBuckets(prefs)
    val open = readOpen(prefs)
    val days = NetworkStatsReader.dayKeysBetween(windowStart, windowEnd).toSet()
    val out = HashMap<String, Long>()

    for (pkg in buckets.keys().asSequence().toList()) {
      val perDay = buckets.optJSONObject(pkg) ?: continue
      var total = 0L
      for (day in perDay.keys().asSequence().toList()) {
        if (days.contains(day)) total += perDay.optLong(day, 0L)
      }
      if (total > 0) out[pkg] = total
    }

    // Intervals still open are clipped to the window.
    val now = System.currentTimeMillis()
    for (pkg in open.keys().asSequence().toList()) {
      val from = maxOf(open.optLong(pkg, windowStart), windowStart)
      val to = minOf(windowEnd, now)
      if (to > from) out[pkg] = (out[pkg] ?: 0L) + (to - from)
    }
    return out
  }

  // Splits [from, to] across calendar days so a session spanning midnight is counted
  // in the day it actually happened. Calendar-based rather than millis arithmetic, so
  // a DST switch cannot drop or duplicate an hour.
  private fun addInterval(buckets: JSONObject, pkg: String, from: Long, to: Long) {
    if (to <= from) return
    val perDay = buckets.optJSONObject(pkg) ?: JSONObject().also { buckets.put(pkg, it) }
    val cal = Calendar.getInstance()
    cal.timeInMillis = from
    cal.set(Calendar.HOUR_OF_DAY, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    var dayStart = cal.timeInMillis
    while (dayStart < to) {
      val next = cal.clone() as Calendar
      next.add(Calendar.DAY_OF_YEAR, 1)
      val dayEnd = next.timeInMillis
      val overlap = minOf(to, dayEnd) - maxOf(from, dayStart)
      if (overlap > 0) {
        val day = NetworkStatsReader.dayKeyFor(dayStart)
        perDay.put(day, perDay.optLong(day, 0L) + overlap)
      }
      cal.timeInMillis = dayEnd
      dayStart = dayEnd
    }
    pruneDays(perDay)
  }

  private fun pruneDays(perDay: JSONObject) {
    val cutoff = NetworkStatsReader.dayKeyFor(System.currentTimeMillis() - KEEP_DAYS * 86400000L)
    for (day in perDay.keys().asSequence().toList()) {
      if (day < cutoff) perDay.remove(day)
    }
  }

  // A corrupted or half-written store degrades to "nothing tracked" instead of
  // throwing inside a service callback.
  private fun readBuckets(prefs: SharedPreferences): JSONObject =
    runCatching { JSONObject(prefs.getString(PREF_BUCKETS, "{}") ?: "{}") }
      .getOrElse { JSONObject() }

  private fun readOpen(prefs: SharedPreferences): JSONObject =
    runCatching { JSONObject(prefs.getString(PREF_OPEN, "{}") ?: "{}") }
      .getOrElse { JSONObject() }

  private fun write(prefs: SharedPreferences, buckets: JSONObject, open: JSONObject) {
    prefs
      .edit()
      .putString(PREF_BUCKETS, buckets.toString())
      .putString(PREF_OPEN, open.toString())
      .apply()
  }
}
