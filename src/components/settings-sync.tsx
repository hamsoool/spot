/**
 * Stage 8 — the settings sync loop. Renders nothing; it is a mounted side effect.
 *
 * Ordering matters in both directions:
 *  - Nothing is written until a load has been applied. Otherwise the default state of the first
 *    render would be pushed over the document that is about to arrive, and the first thing Stage 8
 *    promises (settings restored after a reinstall) would be undone by its own mount.
 *  - Nothing is loaded while auth is still settling, because the uid is the document path.
 *    'disabled' and 'error' are terminal-for-this-launch states, so they hydrate from the local
 *    cache instead — which is the whole point of the two-tier store.
 *
 * Every path here degrades to "settings stay local". Firestore being down is a console warning,
 * never an exception into the tree, and never a reason the firewall stops working.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useFirebase } from '@/context/firebase-context';
import { useVpn } from '@/context/vpn-context';
import {
  flushSettingsWrite,
  loadFirewallSettings,
  scheduleSettingsWrite,
  type FirewallSettings,
} from '@/services/firewall-settings';

/** Key order is fixed by the object literal in vpn-context, so this is a stable identity. */
function serialize(settings: FirewallSettings): string {
  return JSON.stringify(settings);
}

export function SettingsSync() {
  const { status, uid } = useFirebase();
  const { firewallSettings, applyRemoteSettings } = useVpn();

  // uid/state we have already hydrated for, and the last settings value we either wrote or read.
  const hydratedForRef = useRef<string | null>(null);
  const lastKnownRef = useRef<string>('');

  useEffect(() => {
    if (status === 'signing-in') return;

    const hydrateKey = `${status}:${uid ?? 'local'}`;
    if (hydratedForRef.current === hydrateKey) return;

    let cancelled = false;
    // setState happens in the resolution callback, not here, so a slow or failed read never
    // blocks or re-renders the tree synchronously.
    void loadFirewallSettings(uid)
      .then((loaded) => {
        if (cancelled) return;
        hydratedForRef.current = hydrateKey;
        lastKnownRef.current = serialize(loaded.settings);
        applyRemoteSettings(loaded.settings);
      })
      .catch((error) => {
        // loadFirewallSettings swallows every remote and cache failure internally, so reaching
        // here means a bug rather than an outage. Stay "not hydrated" on purpose: pushing local
        // defaults over a document we never read is the one way this stage can lose settings.
        console.warn('[settings] hydration failed; sync stays local this session:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [status, uid, applyRemoteSettings]);

  useEffect(() => {
    if (hydratedForRef.current === null) return;

    const next = serialize(firewallSettings);
    if (next === lastKnownRef.current) return;
    lastKnownRef.current = next;
    // uid is null when Firebase is absent/unavailable — scheduleSettingsWrite then stays local.
    scheduleSettingsWrite(uid, firewallSettings);
  }, [firewallSettings, uid]);

  // A debounced write lost to a swipe-away is a silently dropped setting.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushSettingsWrite();
    });
    return () => subscription.remove();
  }, []);

  return null;
}
