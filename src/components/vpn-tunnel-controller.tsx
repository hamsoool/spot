/**
 * Stage 9 — the tunnel controller. Renders nothing; it is a mounted side effect, exactly
 * like SettingsSync.
 *
 * The context owns the *intent* (vpnEnabled + preferredServerRegion), because that is what
 * gets persisted to Firestore. This component owns the *side effect* of turning that intent
 * into a running WireGuard tunnel — which additionally needs the signed-in uid (the device
 * id the provisioning endpoint expects), and only a component mounted inside both providers
 * has both.
 *
 * Failure is a message, never a throw: provisioning problems (no servers in this build, auth
 * rejected, offline) and native refusals (consent missing, foreground-service blocked) land in
 * `tunnelError`, which Settings renders. Leaving the switch on with an error is deliberate —
 * the preference is still the user's, and the uid is in `applyKey`, so a device that was still
 * signing in re-applies the moment it has an identity.
 */
import { useEffect, useRef } from 'react';

import { useFirebase } from '@/context/firebase-context';
import { LOCATIONS, useVpn } from '@/context/vpn-context';
import { isFirewallAvailable, VpnFirewall, vpnEvents } from '@/native/VpnFirewall';
import { provisionTunnelConfig } from '@/services/vpn-provisioning';

/** 'sg' (the stored default) must land on 'sg-sin', not on nothing. */
export function resolveRegionId(region: string): string {
  if (LOCATIONS.some((location) => location.id === region)) return region;
  const match = LOCATIONS.find((location) => location.id.startsWith(`${region}-`));
  return match?.id ?? LOCATIONS[0].id;
}

export function VpnTunnelController() {
  const {
    vpnEnabled,
    preferredServerRegion,
    firewallSettings,
    setTunnelBusy,
    setTunnelError,
  } = useVpn();
  const { uid } = useFirebase();

  // The newest intent the controller has already acted on. A ref, not state: acting on it
  // must not itself schedule a render.
  const appliedRef = useRef<string | null>(null);
  // Read by the native listener below without re-subscribing on every toggle.
  const vpnEnabledRef = useRef(vpnEnabled);
  useEffect(() => {
    vpnEnabledRef.current = vpnEnabled;
  }, [vpnEnabled]);

  const regionId = resolveRegionId(preferredServerRegion);
  const alwaysAllowed = firewallSettings.alwaysAllowedPackages;
  const applyKey = vpnEnabled ? `on:${regionId}:${uid ?? 'anonymous'}` : "off";

  // Native reports tunnel death asynchronously (revoked consent, engine failure); surface it
  // instead of leaving the switch lying about a tunnel that is gone.
  useEffect(() => {
    const subscription = vpnEvents.addListener((event) => {
      if (event.type !== 'stateChanged') return;
      if (event.payload.vpn === false && event.payload.error && vpnEnabledRef.current) {
        setTunnelError(event.payload.error);
      }
    });
    return () => subscription.remove();
  }, [setTunnelError]);

  useEffect(() => {
    if (appliedRef.current === applyKey) return;
    appliedRef.current = applyKey;
    let cancelled = false;

    // Every state write lives inside this task, never in the effect body: React's
    // set-state-in-effect rule (and the cascading render it prevents) applies to the body.
    void (async () => {
      if (!isFirewallAvailable()) {
        if (vpnEnabled) {
          setTunnelError('The firewall module is not available in this build.');
        }
        return;
      }
      setTunnelBusy(true);
      try {
        if (!vpnEnabled) {
          // A mode switch, not a stop: the firewall keeps running (see VpnFirewall).
          await VpnFirewall.stopVpnTunnel(alwaysAllowed);
          if (!cancelled) setTunnelError(null);
          return;
        }
        const provisioned = await provisionTunnelConfig({
          regionId,
          deviceId: uid ?? 'anonymous',
        });
        if (!provisioned.ok) {
          if (!cancelled) setTunnelError(provisioned.message);
          return;
        }
        await VpnFirewall.startVpnTunnel(provisioned.config, alwaysAllowed);
        if (!cancelled) setTunnelError(null);
      } catch (error) {
        if (!cancelled) {
          setTunnelError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setTunnelBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    alwaysAllowed,
    applyKey,
    regionId,
    setTunnelBusy,
    setTunnelError,
    uid,
    vpnEnabled,
  ]);

  return null;
}
