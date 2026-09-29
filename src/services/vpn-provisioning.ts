/**
 * Stage 9 — obtaining a WireGuard config. THE ONLY PLACE THAT KNOWS WHERE CONFIGS COME FROM.
 *
 * Users never see a key, a URL, or a config. The app *is* the provider: the address of the
 * operator's provisioning service is baked into the build, and the device authenticates with
 * the Firebase ID token of whoever is signed in — including the anonymous account Stage 8
 * creates on first launch. The server verifies that token with its own service account and
 * mints a peer. That means there is no secret shipped inside the APK to extract, and nothing
 * for a non-technical user to paste.
 *
 * Endpoint contract (see ANDROID_IMPLEMENTATION_PLAN.md Stage 9):
 *   POST {base}/v1/peers
 *   Authorization: Bearer {firebase id token}
 *   { "region": "<LocationItem.id>", "deviceId": "<uid>", "publicKey"?: "<base64>" }
 *   → 200 { "config": "<wg-quick .conf text>" }   (text/plain body accepted too)
 *   → 401/403 when the token is missing, expired, or not entitled to a peer
 *
 * `manual` is a developer-only override for builds that have no server yet: a wg-quick config
 * pasted into the developer screen, kept on-device. It is deliberately absent from Settings.
 *
 * Every failure is a value, never a throw, so the switch can explain itself.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { firebaseAuth } from '@/lib/firebase';
import type { VpnTunnelConfig } from '@/native/VpnFirewall';

const MANUAL_CONFIG_KEY = 'spot.vpn.manualConfig.v1';
const REQUEST_TIMEOUT_MS = 15_000;
const PEERS_PATH = '/v1/peers';

export type ProvisioningSource = 'manual' | 'server' | 'none';

export interface ProvisioningStatus {
  source: ProvisioningSource;
  /** Human label for the source, e.g. "app server". */
  label: string;
  /** False only when this build cannot provision at all — the switch explains itself. */
  available: boolean;
  /** Present when unavailable, so a screen can say what an operator must set. */
  hint?: string;
}

export type ProvisioningFailure = {
  ok: false;
  reason: 'not-configured' | 'auth' | 'network' | 'invalid-response';
  message: string;
};

export type ProvisioningResult = { ok: true; config: VpnTunnelConfig } | ProvisioningFailure;

export interface ProvisionRequest {
  regionId: string;
  deviceId: string;
  /** Stable per-install id the server may key peers on; the uid is already `deviceId`. */
  publicKey?: string;
}

/**
 * Base URL of the operator's provisioning service. Two ways to set it, both build-time:
 * an `EXPO_PUBLIC_VPN_PROVISIONING_URL` env var (read straight in the source so Metro and EAS
 * inline it), or `extra.vpnProvisioningUrl` in app.config.js. Nothing here is user-editable.
 */
function provisioningBaseUrl(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_VPN_PROVISIONING_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const extra = Constants.expoConfig?.extra as { vpnProvisioningUrl?: unknown } | undefined;
  const fromConfig = typeof extra?.vpnProvisioningUrl === 'string' ? extra.vpnProvisioningUrl : '';
  return fromConfig.trim() ? fromConfig.trim().replace(/\/+$/, '') : null;
}

/**
 * The signed-in user's Firebase ID token, or null. Anonymous accounts are enough — the server
 * needs to know *which device* to mint a peer for, not who the human is.
 */
async function firebaseIdToken(): Promise<string | null> {
  const auth = firebaseAuth();
  if (!auth) return null;
  try {
    return (await auth.currentUser?.getIdToken()) ?? null;
  } catch (error) {
    console.warn('[vpn] id token unavailable:', error);
    return null;
  }
}

// --- developer override -----------------------------------------------------

/** Reads the override without throwing; only provisioning and the dev screen look at this. */
export async function readManualTunnelConfig(): Promise<VpnTunnelConfig | null> {
  try {
    const stored = await AsyncStorage.getItem(MANUAL_CONFIG_KEY);
    return stored ? parseWgQuickConfig(stored) : null;
  } catch (error) {
    console.warn('[vpn] manual config read failed:', error);
    return null;
  }
}

/** Outcome of a dev-screen write; `ok` means "stored", including an intentional clear. */
export interface ManualConfigOutcome {
  ok: boolean;
  message: string;
}

/** Parses before storing, so a broken paste fails loudly in the dev screen. */
export async function writeManualTunnelConfig(text: string): Promise<ManualConfigOutcome> {
  const trimmed = text.trim();
  if (!trimmed) {
    await AsyncStorage.removeItem(MANUAL_CONFIG_KEY);
    return { ok: true, message: 'Cleared — the switch goes back to the app’s server.' };
  }
  const parsed = parseWgQuickConfig(trimmed);
  if (!parsed) {
    return {
      ok: false,
      message: 'That config is missing PrivateKey, Address, Peer PublicKey or Endpoint.',
    };
  }
  await AsyncStorage.setItem(MANUAL_CONFIG_KEY, trimmed);
  return { ok: true, message: `Saved ${parsed.name} — the VPN switch will use it.` };
}

/** What the UI shows: whether this build can provision, and from where. */
export async function provisioningStatus(): Promise<ProvisioningStatus> {
  if (await readManualTunnelConfig()) {
    return { source: 'manual', label: 'developer config', available: true };
  }
  if (provisioningBaseUrl()) {
    return { source: 'server', label: 'app server', available: true };
  }
  return {
    source: 'none',
    label: 'not configured',
    available: false,
    hint: 'This build has no VPN servers yet.',
  };
}

// --- provisioning -----------------------------------------------------------

/**
 * Turn a region + device into a ready-to-run tunnel config. Tries the developer override first
 * (it exists precisely so a tunnel can be tested before a server exists), then the app's own
 * service. `deviceId` is the Firebase uid, so peers are per-account without any signup step.
 */
export async function provisionTunnelConfig(
  request: ProvisionRequest,
): Promise<ProvisioningResult> {
  const manual = await readManualTunnelConfig();
  if (manual) return { ok: true, config: { ...manual, regionId: request.regionId } };

  const base = provisioningBaseUrl();
  if (!base) {
    return {
      ok: false,
      reason: 'not-configured',
      message:
        'This build has no VPN servers configured yet, so there is nothing to connect to. Ask for a build with EXPO_PUBLIC_VPN_PROVISIONING_URL set.',
    };
  }
  return requestFromAppServer(base, request);
}

async function requestFromAppServer(
  base: string,
  request: ProvisionRequest,
): Promise<ProvisioningResult> {
  const token = await firebaseIdToken();
  if (!token) {
    // No Firebase in this binary, or sign-in has not produced a user yet. The controller runs
    // again the moment the uid changes, so this is worth stating rather than retrying blindly.
    return {
      ok: false,
      reason: 'auth',
      message: 'Waiting for sign-in before the VPN can be provisioned.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${PEERS_PATH}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        region: request.regionId,
        deviceId: request.deviceId,
        ...(request.publicKey ? { publicKey: request.publicKey } : {}),
      }),
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason: 'auth',
        message: 'The VPN server did not accept this account.',
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        reason: 'invalid-response',
        message: `The VPN server is unavailable right now (${response.status}).`,
      };
    }

    const text = await readConfigText(response);
    if (!text) {
      return {
        ok: false,
        reason: 'invalid-response',
        message: 'The VPN server returned no config.',
      };
    }
    const parsed = parseWgQuickConfig(text);
    if (!parsed) {
      return {
        ok: false,
        reason: 'invalid-response',
        message: 'The VPN server returned a config this app cannot read.',
      };
    }
    return { ok: true, config: { ...parsed, regionId: request.regionId } };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      reason: 'network',
      message: aborted
        ? 'The VPN server did not answer in time.'
        : 'Could not reach the VPN server. Check your connection.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** `{ "config": "…" }` or a `text/plain` body; anything else is treated as missing. */
async function readConfigText(response: Response): Promise<string | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await response.json()) as { config?: unknown };
    return typeof body?.config === 'string' ? body.config : null;
  }
  const text = await response.text();
  return text.trim().length > 0 ? text : null;
}

// Minimal wg-quick reader: [Interface]/[Peer] sections, key = value pairs, # and ; comments.
// Returns null when a required field is missing rather than guessing one; the first [Peer]
// block wins (this client models one peer). Repeated keys are joined with ", " so multi-line
// Address/DNS/AllowedIPs entries survive.
export function parseWgQuickConfig(text: string): VpnTunnelConfig | null {
  const sections = new Map<string, Map<string, string>>();
  let section: Map<string, string> | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[#;].*$/, '').trim();
    if (!line) continue;

    const header = /^\[(.+)]$/.exec(line);
    if (header) {
      const name = header[1].trim().toLowerCase();
      if ((name === 'interface' || name === 'peer') && !sections.has(name)) {
        section = new Map();
        sections.set(name, section);
      } else {
        section = null; // unknown or repeated section: ignore its contents
      }
      continue;
    }

    if (!section) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (!value) continue;
    const existing = section.get(key);
    section.set(key, existing ? `${existing}, ${value}` : value);
  }

  const iface = sections.get('interface');
  const peer = sections.get('peer');
  const privateKey = iface?.get('privatekey');
  const addresses = iface?.get('address');
  const peerPublicKey = peer?.get('publickey');
  const endpoint = peer?.get('endpoint');
  if (!privateKey || !addresses || !peerPublicKey || !endpoint) return null;

  const mtu = Number.parseInt(iface?.get('mtu') ?? '', 10);
  const keepalive = Number.parseInt(peer?.get('persistentkeepalive') ?? '', 10);

  return {
    name: 'spot-vpn',
    privateKey,
    addresses,
    dnsServers: iface?.get('dns') ?? null,
    mtu: Number.isFinite(mtu) ? mtu : null,
    peerPublicKey,
    endpoint,
    // A peer without AllowedIPs is not a usable full tunnel; default to the standard one.
    allowedIps: peer?.get('allowedips') ?? '0.0.0.0/0, ::/0',
    presharedKey: peer?.get('presharedkey') ?? null,
    persistentKeepalive: Number.isFinite(keepalive) ? keepalive : null,
    excludedApplications: [],
    regionId: null,
  };
}

