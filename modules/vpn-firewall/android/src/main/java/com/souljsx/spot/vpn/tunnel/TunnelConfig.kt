package com.souljsx.spot.vpn.tunnel

import org.json.JSONException
import org.json.JSONObject

/**
 * Stage 9 — connection parameters for one WireGuard tunnel, in the shape the JS layer posts
 * over the bridge. `src/services/vpn-provisioning.ts` parses the wg-quick `.conf` text
 * returned by the operator's provisioning API into exactly these fields.
 *
 * This is a plain data holder: it knows nothing about the WireGuard library or the
 * VpnService, so a future TunnelClient implementation for a different backend can reuse it
 * without touching VpnFirewallService (see TunnelClient.kt).
 */
data class TunnelConfig(
  /** Interface name shown in Android's VPN UI; must satisfy the library's NAME_PATTERN. */
  val name: String,
  /** Interface PrivateKey (base64). */
  val privateKey: String,
  /** Interface Address list in .conf syntax, e.g. "10.7.0.2/32, fd00::2/128". */
  val addresses: String,
  /** Interface DNS servers, e.g. "1.1.1.1, 2606:4700:4700::1111". Null = omit. */
  val dnsServers: String?,
  /** Interface MTU. Null = the library default (1280). */
  val mtu: Int?,
  /** Peer PublicKey (base64). */
  val peerPublicKey: String,
  /** Peer Endpoint, "host:port". */
  val endpoint: String,
  /** Peer AllowedIPs; "0.0.0.0/0, ::/0" means a full tunnel. */
  val allowedIps: String,
  /** Peer PresharedKey (base64). Null = none. */
  val presharedKey: String?,
  /** Peer PersistentKeepalive in seconds. Null = none. */
  val persistentKeepalive: Int?,
  /**
   * Packages excluded from the tunnel (Android's addDisallowedApplication set). The service
   * rewrites this on every foreground-app change, so the value arriving over the bridge is
   * only a starting point.
   */
  val excludedApplications: List<String>,
  /** Bookkeeping only: which region the operator provisioned, for logs and UI. */
  val regionId: String?,
) {
  /** Same tunnel, different bypass set — used when the foreground app changes. */
  fun withExcludedApplications(packages: Collection<String>): TunnelConfig =
    copy(excludedApplications = packages.toList())

  companion object {
    /**
     * Parses the bridge payload. Throws [IllegalArgumentException] naming the missing field
     * (the module reports that to JS as a rejection) rather than building a half-config.
     */
    @Throws(JSONException::class)
    fun fromJson(json: String): TunnelConfig {
      val root = JSONObject(json)

      fun required(key: String): String {
        val value = root.optString(key, "")
        require(value.isNotBlank()) { "Tunnel config is missing \"$key\"" }
        return value
      }

      val rawExcluded = root.optJSONArray("excludedApplications")
      val excluded = buildList {
        if (rawExcluded != null) {
          for (i in 0 until rawExcluded.length()) {
            val pkg = rawExcluded.optString(i, "").trim()
            if (pkg.isNotEmpty()) add(pkg)
          }
        }
      }

      return TunnelConfig(
        // A default name is safe: the library validates the pattern, and this one matches it.
        name = root.optString("name").ifBlank { "spot-vpn" },
        privateKey = required("privateKey"),
        addresses = required("addresses"),
        dnsServers = root.optString("dnsServers").ifBlank { null },
        mtu = if (root.has("mtu") && !root.isNull("mtu")) root.optInt("mtu") else null,
        peerPublicKey = required("peerPublicKey"),
        endpoint = required("endpoint"),
        allowedIps = required("allowedIps"),
        presharedKey = root.optString("presharedKey").ifBlank { null },
        persistentKeepalive =
          if (root.has("persistentKeepalive") && !root.isNull("persistentKeepalive"))
            root.optInt("persistentKeepalive")
          else null,
        excludedApplications = excluded,
        regionId = root.optString("regionId").ifBlank { null },
      )
    }
  }
}
