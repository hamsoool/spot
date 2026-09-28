import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { FirewallSettings } from '@/services/firewall-settings';
import { DEFAULT_FIREWALL_SETTINGS } from '@/services/firewall-settings';

export interface LocationItem {
  id: string;
  city: string;
  country: string;
  flag: string;
  latencyMs: number;
  speedTag: 'Fastest' | 'Fast' | 'Standard';
  tags: ('fastest' | 'nearby' | 'streaming')[];
  serverName: string;
}

export const LOCATIONS: LocationItem[] = [
  {
    id: 'de-fra',
    city: 'Frankfurt',
    country: 'Germany',
    flag: '🇩🇪',
    latencyMs: 18,
    speedTag: 'Fastest',
    tags: ['fastest', 'nearby', 'streaming'],
    serverName: 'Natural Guard • FRA-1',
  },
  {
    id: 'ch-zrh',
    city: 'Zurich',
    country: 'Switzerland',
    flag: '🇨🇭',
    latencyMs: 24,
    speedTag: 'Fast',
    tags: ['fastest', 'nearby'],
    serverName: 'Alpine Shield • ZRH-2',
  },
  {
    id: 'gb-lon',
    city: 'London',
    country: 'United Kingdom',
    flag: '🇬🇧',
    latencyMs: 29,
    speedTag: 'Fast',
    tags: ['fastest', 'streaming', 'nearby'],
    serverName: 'Crown Guard • LON-4',
  },
  {
    id: 'us-nyc',
    city: 'New York',
    country: 'United States',
    flag: '🇺🇸',
    latencyMs: 82,
    speedTag: 'Fast',
    tags: ['streaming'],
    serverName: 'Liberty Line • NYC-7',
  },
  {
    id: 'jp-tyo',
    city: 'Tokyo',
    country: 'Japan',
    flag: '🇯🇵',
    latencyMs: 145,
    speedTag: 'Fast',
    tags: ['streaming'],
    serverName: 'Pacific Wave • TYO-3',
  },
  {
    id: 'sg-sin',
    city: 'Singapore',
    country: 'Singapore',
    flag: '🇸🇬',
    latencyMs: 120,
    speedTag: 'Fast',
    tags: ['streaming', 'nearby'],
    serverName: 'Merlion Safe • SIN-1',
  },
];

export type DataSaverStrength = 'normal' | 'high' | 'super';

export interface DataSaverApp {
  id: string;
  name: string;
  iconName: string;
  iconColor: string;
  iconBgColor: string;
  savedLabel: string;
  enabled: boolean;
}

export interface VpnContextType {
  isConnected: boolean;
  toggleConnection: () => void;
  selectedLocation: LocationItem;
  selectLocation: (location: LocationItem) => void;

  // Data Saver settings
  saverStrength: DataSaverStrength;
  setSaverStrength: (val: DataSaverStrength) => void;
  saverApps: DataSaverApp[];
  toggleSaverApp: (appId: string) => void;

  // Safety settings
  publicWifiProtection: boolean;
  setPublicWifiProtection: (val: boolean) => void;
  pauseOnDrop: boolean;
  setPauseOnDrop: (val: boolean) => void;
  blockTrackers: boolean;
  setBlockTrackers: (val: boolean) => void;

  // Optimization toggles
  videoQualitySaver: boolean;
  setVideoQualitySaver: (val: boolean) => void;
  compressPictures: boolean;
  setCompressPictures: (val: boolean) => void;

  /**
   * Stage 8: this state, projected into the `users/{uid}/settings/firewall` shape. The sync layer
   * watches it and mirrors it to AsyncStorage + Firestore; plan fields with no UI owner yet
   * (`firewallEnabled`, `vpnEnabled`, `preferredServerRegion`, `alwaysAllowedPackages`) ride along
   * at their defaults so the stored document matches the schema instead of being a partial record.
   */
  firewallSettings: FirewallSettings;
  /**
   * Stage 8: overwrite the UI-facing settings from a remote or cached load. Deliberately does not
   * touch `isConnected`/`selectedLocation` — starting the real firewall is native consent flow
   * (Stages 2/4), not a settings write, and must never be triggered by a Firestore read landing.
   */
  applyRemoteSettings: (settings: FirewallSettings) => void;
}

const DEFAULT_APPS: DataSaverApp[] = [
  {
    id: 'yt',
    name: 'YouTube',
    iconName: 'play',
    iconColor: '#FF0000',
    iconBgColor: 'rgba(255, 0, 0, 0.12)',
    savedLabel: 'Saved 5.8 GB on videos',
    enabled: true,
  },
  {
    id: 'ig',
    name: 'Instagram',
    iconName: 'camera',
    iconColor: '#E1306C',
    iconBgColor: 'rgba(225, 48, 108, 0.12)',
    savedLabel: 'Saved 3.4 GB on photos & reels',
    enabled: true,
  },
  {
    id: 'tt',
    name: 'TikTok',
    iconName: 'music',
    iconColor: '#000000',
    iconBgColor: 'rgba(0, 0, 0, 0.08)',
    savedLabel: 'Saved 2.9 GB',
    enabled: true,
  },
  {
    id: 'wb',
    name: 'Web Browsing',
    iconName: 'globe',
    iconColor: '#007AFF',
    iconBgColor: 'rgba(0, 122, 255, 0.12)',
    savedLabel: 'Saved 2.7 GB on web pages',
    enabled: true,
  },
];

const VpnContext = createContext<VpnContextType | undefined>(undefined);

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [selectedLocation, setSelectedLocation] = useState<LocationItem>(LOCATIONS[0]);
  const [saverStrength, setSaverStrength] = useState<DataSaverStrength>('high');
  const [saverApps, setSaverApps] = useState<DataSaverApp[]>(DEFAULT_APPS);

  // Settings
  const [publicWifiProtection, setPublicWifiProtection] = useState(true);
  const [pauseOnDrop, setPauseOnDrop] = useState(true);
  const [blockTrackers, setBlockTrackers] = useState(true);
  const [videoQualitySaver, setVideoQualitySaver] = useState(true);
  const [compressPictures, setCompressPictures] = useState(true);

  const toggleConnection = () => {
    setIsConnected((prev) => !prev);
  };

  const selectLocation = (location: LocationItem) => {
    setSelectedLocation(location);
  };

  const toggleSaverApp = (appId: string) => {
    setSaverApps((apps) =>
      apps.map((app) => (app.id === appId ? { ...app, enabled: !app.enabled } : app))
    );
  };

  // Stage 8 fields that the plan's schema stores but no screen owns yet. Keep them in one place so
  // the first stage that does own one (Stage 9's region picker, the allow-list UI) only has to
  // replace a useState here, and the Firestore document keeps its shape in the meantime.
  const [alwaysAllowedPackages] = useState<string[]>(DEFAULT_FIREWALL_SETTINGS.alwaysAllowedPackages);
  const [preferredServerRegion] = useState(DEFAULT_FIREWALL_SETTINGS.preferredServerRegion);

  const firewallSettings = useMemo<FirewallSettings>(
    () => ({
      firewallEnabled: true,
      alwaysAllowedPackages,
      vpnEnabled: false,
      preferredServerRegion,
      publicWifiProtection,
      pauseOnDrop,
      blockTrackers,
      videoQualitySaver,
      compressPictures,
      saverStrength,
      enabledSaverAppIds: saverApps.filter((app) => app.enabled).map((app) => app.id),
    }),
    [
      alwaysAllowedPackages,
      preferredServerRegion,
      publicWifiProtection,
      pauseOnDrop,
      blockTrackers,
      videoQualitySaver,
      compressPictures,
      saverStrength,
      saverApps,
    ]
  );

  const applyRemoteSettings = useCallback((settings: FirewallSettings) => {
    setPublicWifiProtection(settings.publicWifiProtection);
    setPauseOnDrop(settings.pauseOnDrop);
    setBlockTrackers(settings.blockTrackers);
    setVideoQualitySaver(settings.videoQualitySaver);
    setCompressPictures(settings.compressPictures);
    setSaverStrength(settings.saverStrength);
    // Match by id against the apps this build knows about; ids the app no longer ships are
    // dropped, and apps added since the document was written keep their local default.
    setSaverApps((apps) =>
      apps.map((app) => ({ ...app, enabled: settings.enabledSaverAppIds.includes(app.id) }))
    );
  }, []);

  const value = useMemo(
    () => ({
      isConnected,
      toggleConnection,
      selectedLocation,
      selectLocation,
      saverStrength,
      setSaverStrength,
      saverApps,
      toggleSaverApp,
      publicWifiProtection,
      setPublicWifiProtection,
      pauseOnDrop,
      setPauseOnDrop,
      blockTrackers,
      setBlockTrackers,
      videoQualitySaver,
      setVideoQualitySaver,
      compressPictures,
      setCompressPictures,
      firewallSettings,
      applyRemoteSettings,
    }),
    [
      isConnected,
      selectedLocation,
      saverStrength,
      saverApps,
      publicWifiProtection,
      pauseOnDrop,
      blockTrackers,
      videoQualitySaver,
      compressPictures,
      firewallSettings,
      applyRemoteSettings,
    ]
  );

  return <VpnContext.Provider value={value}>{children}</VpnContext.Provider>;
}

export function useVpn() {
  const ctx = useContext(VpnContext);
  if (!ctx) {
    throw new Error('useVpn must be used within a VpnProvider');
  }
  return ctx;
}
