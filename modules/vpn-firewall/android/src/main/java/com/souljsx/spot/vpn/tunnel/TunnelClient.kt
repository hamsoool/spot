package com.souljsx.spot.vpn.tunnel

/**
 * Stage 9 — the swap point the plan calls for: VpnFirewallService talks to this interface
 * only, so a different backend (Outline/Xray) can replace [WireGuardTunnelClient] without
 * touching the service.
 *
 * The plan names three methods: connect / disconnect / isConnected. Two additions are
 * required by how this app actually drives a tunnel, and are logged as a deviation:
 *  - [updateExcludedApplications]: the foreground-app bypass set changes while the tunnel is
 *    up, and Android cannot hot-swap it (a VpnService.Builder is fixed once establish() has
 *    run), so the client has to re-establish with the new set.
 *  - [setListener]: establish/teardown can fail long after the call returns; the service
 *    needs that signal for its events and its notification.
 */
interface TunnelClient {
  fun setListener(listener: Listener?)

  /** Bring the tunnel up with [config]. False when the backend refused. */
  fun connect(config: TunnelConfig): Boolean

  /** Tear the tunnel down. False when the backend refused. */
  fun disconnect(): Boolean

  fun isConnected(): Boolean

  /**
   * Re-establish a running tunnel with a different bypass set. Returns true (and does
   * nothing) when the tunnel is down, so callers can invoke it unconditionally on every
   * foreground-app change.
   */
  fun updateExcludedApplications(packages: Collection<String>): Boolean

  interface Listener {
    /** [error] is null for a clean transition; non-null means the tunnel is gone. */
    fun onTunnelStateChanged(connected: Boolean, error: String?)
  }
}
