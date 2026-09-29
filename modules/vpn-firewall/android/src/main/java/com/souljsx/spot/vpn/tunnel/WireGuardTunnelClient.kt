package com.souljsx.spot.vpn.tunnel

import android.content.Context
import android.util.Log

import com.wireguard.android.backend.Backend
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.BadConfigException
import com.wireguard.config.Config
import com.wireguard.config.Interface
import com.wireguard.config.Peer

/**
 * Stage 9 — WireGuard implementation of [TunnelClient] over the official userspace backend
 * (com.wireguard.android:tunnel, Apache-2.0).
 *
 * The facts this file relies on were read from the library's own source, not assumed:
 *  - `GoBackend.setState(tunnel, UP, config)` calls `service.getBuilder()` on the hosting
 *    VpnService and applies the config's `ExcludedApplications` through
 *    `Builder.addDisallowedApplication` — i.e. this app's bypass set keeps working while the
 *    tunnel is up, which is what "foreground app stays direct" needs.
 *  - Re-configuring is supported: calling setState(UP, <different Config instance>) makes the
 *    backend tear the running tunnel down and bring the new configuration up itself; the same
 *    instance is treated as a no-op because the comparison is by identity.
 *  - The library protects its own UDP sockets via `VpnService.protect` once the tunnel is up,
 *    so no socket handling is needed here (plan §Stage 9 requirement).
 *
 * Rules this file must never break:
 *  - Never set IncludedApplications: the whole app is written in disallow-mode (plan §7) and
 *    the library refuses a config that carries both sets.
 *  - Never log private keys, preshared keys or full configs: [TunnelConfig] holds secrets.
 */
class WireGuardTunnelClient(
  context: Context,
  private val tunnelName: String = DEFAULT_TUNNEL_NAME,
) : TunnelClient, Tunnel {

  private val backend: Backend = GoBackend(context.applicationContext)
  private var currentConfig: TunnelConfig? = null
  private var listener: TunnelClient.Listener? = null

  // --- TunnelClient ---------------------------------------------------------

  override fun setListener(listener: TunnelClient.Listener?) {
    this.listener = listener
  }

  override fun isConnected(): Boolean = backend.getState(this) == Tunnel.State.UP

  override fun connect(config: TunnelConfig): Boolean {
    return try {
      backend.setState(this, Tunnel.State.UP, buildWgConfig(config))
      currentConfig = config
      listener?.onTunnelStateChanged(true, null)
      true
    } catch (t: Throwable) {
      // BackendException (tun creation / go activation / DNS) and BadConfigException both
      // land here. The bridge turns this into a stateChanged event; it must never crash
      // the service.
      Log.w(TAG, "tunnel up failed reason=${t.javaClass.simpleName}: ${t.message}")
      currentConfig = null
      listener?.onTunnelStateChanged(false, t.message ?: "Tunnel could not start.")
      false
    }
  }

  override fun disconnect(): Boolean {
    return try {
      if (isConnected()) backend.setState(this, Tunnel.State.DOWN, null)
      currentConfig = null
      true
    } catch (t: Throwable) {
      Log.w(TAG, "tunnel down failed reason=${t.javaClass.simpleName}: ${t.message}")
      false
    }
  }

  override fun updateExcludedApplications(packages: Collection<String>): Boolean {
    val config = currentConfig ?: return true // not connected: nothing to re-apply
    // A fresh TunnelConfig/Config instance is what makes the backend re-establish; reusing
    // the same instance would be treated as a no-op.
    return connect(config.withExcludedApplications(packages))
  }

  // --- the library's own Tunnel interface -----------------------------------

  override fun getName(): String = tunnelName

  override fun onStateChange(state: Tunnel.State) {
    listener?.onTunnelStateChanged(state == Tunnel.State.UP, null)
  }

  // --- config translation ----------------------------------------------------

  /**
   * [TunnelConfig] fields are already .conf syntax, so each one goes through the library's
   * own parsers — the same code path a pasted .conf file takes, which is what catches typos
   * in keys/masks/endpoints instead of handing garbage to wireguard-go.
   */
  @Throws(BadConfigException::class)
  private fun buildWgConfig(config: TunnelConfig): Config {
    val iface = Interface.Builder()
      .parsePrivateKey(config.privateKey)
      .parseAddresses(config.addresses)
    config.dnsServers?.let { iface.parseDnsServers(it) }
    config.mtu?.let { iface.setMtu(it) }
    // Guard the empty case: parsing an empty list would produce a blank package name, and
    // addDisallowedApplication("") throws.
    if (config.excludedApplications.isNotEmpty()) {
      iface.parseExcludedApplications(config.excludedApplications.joinToString(", "))
    }

    val peer = Peer.Builder()
      .parsePublicKey(config.peerPublicKey)
      .parseEndpoint(config.endpoint)
      .parseAllowedIPs(config.allowedIps)
    config.presharedKey?.let { peer.parsePreSharedKey(it) }
    config.persistentKeepalive?.let { peer.parsePersistentKeepalive(it.toString()) }

    return Config.Builder()
      .setInterface(iface.build())
      .addPeer(peer.build())
      .build()
  }

  private companion object {
    const val TAG = "SpotVpnTunnel"
    const val DEFAULT_TUNNEL_NAME = "spot-vpn"
  }
}
