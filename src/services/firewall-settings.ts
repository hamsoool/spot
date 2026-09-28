/**
 * Stage 8 — the Firestore settings mirror.
 *
 * Shape is the schema from §Stage 8 (`users/{uid}/settings/firewall`) widened with the toggles the
 * UI actually owns today, so a reinstall restores what the user sees rather than a partial record.
 *
 * Two-tier storage, and the local tier is the one the app depends on:
 *  - AsyncStorage is written on every change and is the only thing consulted when there is no
 *    signed-in uid (no Firebase in the build, Firebase unreachable, or an auth error), which is
 *    what Stage 8's "offline still restores last choice" criterion is really about.
 *  - Firestore is a debounced write-through on top; every failure is logged and swallowed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from '@react-native-firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import type { DataSaverStrength } from '@/context/vpn-context';

export const FIREWALL_SETTINGS_COLLECTION = 'settings';
export const FIREWALL_SETTINGS_DOC = 'firewall';

const CACHE_KEY = 'spot.firewall.settings.v1';

/** Merge window for rapid toggles (Stage 8: "debounce rapid toggles to avoid excessive writes"). */
const WRITE_DEBOUNCE_MS = 750;

export interface FirewallSettings {
  firewallEnabled: boolean;
  alwaysAllowedPackages: string[];
  vpnEnabled: boolean;
  preferredServerRegion: string;
  publicWifiProtection: boolean;
  pauseOnDrop: boolean;
  blockTrackers: boolean;
  videoQualitySaver: boolean;
  compressPictures: boolean;
  saverStrength: DataSaverStrength;
  enabledSaverAppIds: string[];
}

export type SettingsSource = 'remote' | 'cache' | 'default';

export interface LoadedSettings {
  settings: FirewallSettings;
  source: SettingsSource;
}

export const DEFAULT_FIREWALL_SETTINGS: FirewallSettings = {
  firewallEnabled: true,
  alwaysAllowedPackages: [],
  vpnEnabled: false,
  preferredServerRegion: 'sg',
  publicWifiProtection: true,
  pauseOnDrop: true,
  blockTrackers: true,
  videoQualitySaver: true,
  compressPictures: true,
  saverStrength: 'high',
  enabledSaverAppIds: [],
};

/** Narrow whatever Firestore or the cache returned down to a usable record; never throws. */
function coerceSettings(input: unknown): FirewallSettings {
  if (!input || typeof input !== 'object') return DEFAULT_FIREWALL_SETTINGS;
  const raw = input as Record<string, unknown>;
  const bool = (key: 'firewallEnabled' | 'vpnEnabled' | 'publicWifiProtection' | 'pauseOnDrop' | 'blockTrackers' | 'videoQualitySaver' | 'compressPictures') =>
    typeof raw[key] === 'boolean' ? raw[key] : DEFAULT_FIREWALL_SETTINGS[key];
  const strings = (key: 'alwaysAllowedPackages' | 'enabledSaverAppIds') =>
    Array.isArray(raw[key]) ? raw[key].filter((v): v is string => typeof v === 'string') : DEFAULT_FIREWALL_SETTINGS[key];

  return {
    firewallEnabled: bool('firewallEnabled'),
    alwaysAllowedPackages: strings('alwaysAllowedPackages'),
    vpnEnabled: bool('vpnEnabled'),
    preferredServerRegion:
      typeof raw.preferredServerRegion === 'string'
        ? raw.preferredServerRegion
        : DEFAULT_FIREWALL_SETTINGS.preferredServerRegion,
    publicWifiProtection: bool('publicWifiProtection'),
    pauseOnDrop: bool('pauseOnDrop'),
    blockTrackers: bool('blockTrackers'),
    videoQualitySaver: bool('videoQualitySaver'),
    compressPictures: bool('compressPictures'),
    saverStrength:
      raw.saverStrength === 'normal' || raw.saverStrength === 'high' || raw.saverStrength === 'super'
        ? raw.saverStrength
        : DEFAULT_FIREWALL_SETTINGS.saverStrength,
    enabledSaverAppIds: strings('enabledSaverAppIds'),
  };
}

export async function readCachedSettings(): Promise<FirewallSettings | null> {
  try {
    const stored = await AsyncStorage.getItem(CACHE_KEY);
    return stored ? coerceSettings(JSON.parse(stored)) : null;
  } catch (error) {
    console.warn('[settings] cache read failed:', error);
    return null;
  }
}

export async function writeCachedSettings(settings: FirewallSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[settings] cache write failed:', error);
  }
}

async function writeSettingsToFirestore(uid: string, settings: FirewallSettings): Promise<void> {
  const db = firebaseDb();
  if (!db) return;
  try {
    await setDoc(doc(db, `users/${uid}`, FIREWALL_SETTINGS_COLLECTION, FIREWALL_SETTINGS_DOC), {
      ...settings,
      // Plain epoch ms, not serverTimestamp(): a local write has to be readable from the offline
      // cache immediately, where a pending server timestamp would come back as null.
      updatedAtMs: Date.now(),
    });
  } catch (error) {
    console.warn('[settings] remote write failed (cache already holds the change):', error);
  }
}

/**
 * Remote first, cache second, defaults last. Always resolves, never rejects: a Firestore outage
 * must land the user on their last known settings, not on a crash or a permanent spinner.
 */
export async function loadFirewallSettings(uid: string | null): Promise<LoadedSettings> {
  if (uid) {
    const db = firebaseDb();
    if (db) {
      try {
        const snapshot = await getDoc(
          doc(db, `users/${uid}`, FIREWALL_SETTINGS_COLLECTION, FIREWALL_SETTINGS_DOC),
        );
        if (snapshot.exists()) {
          const settings = coerceSettings(snapshot.data());
          await writeCachedSettings(settings);
          return { settings, source: 'remote' };
        }
        // Signed in with no document: first run. Seed it so a second device sees this install.
        await writeSettingsToFirestore(uid, DEFAULT_FIREWALL_SETTINGS);
        await writeCachedSettings(DEFAULT_FIREWALL_SETTINGS);
        return { settings: DEFAULT_FIREWALL_SETTINGS, source: 'default' };
      } catch (error) {
        console.warn('[settings] remote read failed, falling back to cache:', error);
      }
    }
  }

  const cached = await readCachedSettings();
  if (cached) return { settings: cached, source: 'cache' };
  await writeCachedSettings(DEFAULT_FIREWALL_SETTINGS);
  return { settings: DEFAULT_FIREWALL_SETTINGS, source: 'default' };
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUid: string | null = null;
let pendingSettings: FirewallSettings | null = null;

function runPendingWrite() {
  const uid = pendingUid;
  const settings = pendingSettings;
  pendingTimer = null;
  pendingUid = null;
  pendingSettings = null;
  if (uid && settings) void writeSettingsToFirestore(uid, settings);
}

/** The local write is immediate; the Firestore write is coalesced over `WRITE_DEBOUNCE_MS`. */
export function scheduleSettingsWrite(uid: string | null, settings: FirewallSettings): void {
  void writeCachedSettings(settings);

  pendingUid = uid;
  pendingSettings = settings;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(runPendingWrite, WRITE_DEBOUNCE_MS);
}

/** Flush a debounced write early, e.g. when the app leaves the foreground. */
export function flushSettingsWrite(): void {
  if (!pendingTimer) return;
  clearTimeout(pendingTimer);
  runPendingWrite();
}
