/**
 * Stage 9 — WireGuard credential provisioning.
 *
 * The operator runs a small HTTPS endpoint that hands each device its own wg-quick config;
 * this module is the only place that talks to it, so no screen needs to know the URL, the
 * API key or the response shape. The API key is entered by the user (Settings → VPN tunnel)
 * or supplied at build time through `extra.vpnProvisioningUrl` / `extra.vpnProvisioningApiKey`
 * in app.config.js; either way it never leaves this module and is never logged.
 *
 * Contract the endpoint must implement:
 *   POST  {endpoint}/v1/peers
 *   Authorization: Bearer {apiKey}
 *   Content-Type: application/json
 *   { "region": "<LocationItem.id>", "deviceId": "<uid>", "publicKey"?: "<base64>" }
 *   → 200 { "config": "<wg-quick .conf text>" }   (a text/plain body is accepted too)
 *
 * Every failure is a value, not a throw: callers render `message` and stay in control.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import type { VpnTunnelConfig } from '@/native/VpnFirewall';

const CREDENTIALS_KEY = 'spot.vpn.provisioning.v1';
const REQUEST_TIMEOUT_MS = 15_000;

export const PROVISIONING_ENDPOINT_PATH = '/v1/peers';

export interface ProvisioningCredentials {
  endpoint: string;
  apiKey: string;
}

export type ProvisioningFailure = {
  ok: false;
  reason: 'not-configured' | 'auth' | 'network' | 'invalid-response';
  message: string;
};

export type ProvisioningResult = { ok: true; config: VpnTunnelConfig } | ProvisioningFailure;

/** Build-time fallback: absent unless app.config.js publishes these in `extra`. */
function buildTimeCredentials(): ProvisioningCredentials | null {
  const extra = Constants.expoConfig?.extra as
    | { vpnProvisioningUrl?: unknown; vpnProvisioningApiKey?: unknown }
    | undefined;
  const endpoint = typeof extra?.vpnProvisioningUrl === 'string' ? extra.vpnProvisioningUrl : '';
  const apiKey = typeof extra?.vpnProvisioningApiKey === 'string' ? extra.vpnProvisioningApiKey : '';
  return endpoint && apiKey ? { endpoint, apiKey } : null;
}

/** Stored credentials win over build-time ones; null means "not configured yet". */
export async function loadProvisioningCredentials(): Promise<ProvisioningCredentials | null> {
  try {
    const stored = await AsyncStorage.getItem(CREDENTIALS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ProvisioningCredentials>;
      if (
        typeof parsed.endpoint === 'string' &&
        parsed.endpoint.trim().length > 0 &&
        typeof parsed.apiKey === 'string' &&
        parsed.apiKey.trim().length > 0
      ) {
        return { endpoint: parsed.endpoint.trim(), apiKey: parsed.apiKey.trim() };
      }
    }
  } catch (error) {
    console.warn('[vpn] provisioning credentials read failed:', error);
  }
  return buildTimeCredentials();
}

export async function saveProvisioningCredentials(
  credentials: ProvisioningCredentials,
): Promise<void> {
  try {
    await AsyncStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  } catch (error) {
    console.warn('[vpn] provisioning credentials write failed:', error);
  }
}

export async function clearProvisioningCredentials(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CREDENTIALS_KEY);
  } catch (error) {
    console.warn('[vpn] provisioning credentials clear failed:', error);
  }
}

export async function isProvisioningConfigured(): Promise<boolean> {
  return (await loadProvisioningCredentials()) !== null;
}

export async function provisionTunnelConfig(options: {
  regionId: string;
  deviceId: string;
  /** Optional Firebase ID token, forwarded as X-Firebase-Token for endpoints that bind peers to accounts. */
  idToken?: string | null;
}): Promise<ProvisioningResult> {
  const credentials = await loadProvisioningCredentials();
  if (!credentials) {
    return {
      ok: false,
      reason: 'not-configured',
      message: 'Add your VPN API key in Settings to use the tunnel.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${credentials.endpoint.replace(/\/+$/, '')}${PROVISIONING_ENDPOINT_PATH}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          'Content-Type': 'application/json',
          ...(options.idToken ? { 'X-Firebase-Token': options.idToken } : {}),
        },
        body: JSON.stringify({ region: options.regionId, deviceId: options.deviceId }),
        signal: controller.signal,
      },
    );

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason: 'auth',
        message: 'The VPN API key was rejected. Check it in Settings.',
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        reason: 'invalid-response',
        message: `The VPN server refused the request (HTTP ${response.status}).`,
      };
    }

    const configText = await readConfigText(response);
    if (!configText) {
      return { ok: false, reason: 'invalid-response', message: 'The VPN server returned no config.' };
    }
    const parsed = parseWgQuickConfig(configText);
    if (!parsed) {
      return {
        ok: false,
        reason: 'invalid-response',
        message: 'The VPN server returned a config this app cannot read.',
      };
    }
    return { ok: true, config: { ...parsed, regionId: options.regionId } };
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

/**
 * Minimal wg-quick reader: `[Interface]` / `[Peer]` sections, `key = value` pairs, and
 * `#`/`;` comments. Returns null when a secret-carrying required field is missing rather
 * than guessing one. Repeated keys are joined with ", " so multi-line Address/DNS/AllowedIPs
 * entries survive; the first `[Peer]` block wins (this client models one peer).
 */
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

