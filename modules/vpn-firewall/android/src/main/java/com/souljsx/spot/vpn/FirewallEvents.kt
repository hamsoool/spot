package com.souljsx.spot.vpn

// One-way bus from non-React components (the VpnService and its watcher thread)
// to the JS listeners. Only a Module instance owns a JSI event emitter, so the
// module publishes a sender here when it is created and clears it when it is
// destroyed; the service never touches React itself.
object FirewallEvents {
  @Volatile
  private var publisher: ((Map<String, Any?>) -> Unit)? = null

  fun install(publisher: (Map<String, Any?>) -> Unit) {
    this.publisher = publisher
  }

  // Identity-checked: during a dev-mode React reload the old instance is torn
  // down after the new one has already installed its publisher, and an
  // unconditional clear would silently kill the surviving listener.
  fun uninstall(publisher: ((Map<String, Any?>) -> Unit)?) {
    if (publisher != null && this.publisher === publisher) this.publisher = null
  }

  // Payload shape mirrors the VpnFirewallEvent union in src/native/VpnFirewall.ts.
  // Safe to call from any thread and at any time: with no listener installed it is
  // a no-op, and a dying React instance must never propagate into the service.
  fun emit(type: String, payload: Map<String, Any?> = emptyMap()) {
    val body = mapOf<String, Any?>("type" to type, "payload" to payload)
    try {
      publisher?.invoke(body)
    } catch (e: Exception) {
      // React instance gone — drop the event rather than crash the firewall.
    }
  }
}
