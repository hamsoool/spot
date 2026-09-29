import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppleTheme } from '@/hooks/use-theme';
import {
  DataSaverStrength,
  LOCATIONS,
  useVpn,
} from '@/context/vpn-context';
import { AppleIcon, IconName } from '@/components/ui/apple-icon';
import { AppleSwitch } from '@/components/ui/apple-switch';
import { BottomTabInset, MaxContentWidth, Spacing, Radius } from '@/constants/theme';
import { DataUsageCard } from '@/components/data-usage-card';
import { resolveRegionId } from '@/components/vpn-tunnel-controller';

const STRENGTHS: { key: DataSaverStrength; label: string }[] = [
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High' },
  { key: 'super', label: 'Super' },
];

const STRENGTH_DESCRIPTIONS: Record<DataSaverStrength, string> = {
  normal: 'Light touch. Keeps full clarity while trimming unnoticed data waste.',
  high: 'Saves data on videos and social apps smoothly with zero lag.',
  super: 'Maximum savings. Ideal when data is running short or roaming.',
};

type FilterKey = 'all' | 'fastest' | 'streaming' | 'nearby';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All Places' },
  { key: 'fastest', label: 'Fastest' },
  { key: 'streaming', label: 'For Streaming' },
  { key: 'nearby', label: 'Nearby' },
];

function getSpeedTone(latencyMs: number, theme: ReturnType<typeof useAppleTheme>) {
  if (latencyMs <= 50) {
    return { label: 'Fast', color: theme.palette.green };
  }
  if (latencyMs <= 150) {
    return { label: 'Good', color: theme.palette.orange };
  }
  return { label: 'Okay', color: theme.textSecondary };
}

export default function DataScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAppleTheme();
  // Each section below owns its own useVpn() slice; the screen itself only
  // needs the layout metrics.
  const bottomPadding = insets.bottom + BottomTabInset + Spacing.xl;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* iOS Navigation Bar */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 12),
            backgroundColor: theme.background,
            borderBottomColor: theme.border,
          },
        ]}>
        <View style={styles.headerContent}>
          <View style={styles.headerTitleGroup}>
            <View
              style={[styles.headerIconCircle, { backgroundColor: theme.blueBadgeBg }]}>
              <AppleIcon name="bolt" size={17} color={theme.blueBadgeText} />
            </View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Data
            </Text>
          </View>
          <View style={[styles.avatarButton, { backgroundColor: theme.gray5 }]}>
            <AppleIcon name="person" size={17} color={theme.textSecondary} />
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.contentWrapper}>
          <DataUsageCard />

          <ConnectionSection />
          <DataSaverSection />
        </View>
      </ScrollView>
    </View>
  );
}

function ConnectionSection() {
  const theme = useAppleTheme();
  const {
    selectedLocation,
    selectLocation,
    vpnEnabled,
    preferredServerRegion,
    setPreferredServerRegion,
  } = useVpn();
  // The same list is the plan's region picker: the row the tunnel will provision against.
  const tunnelRegionId = resolveRegionId(preferredServerRegion);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const visibleLocations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return LOCATIONS.filter((location) => {
      const matchesQuery =
        normalized.length === 0 ||
        location.city.toLowerCase().includes(normalized) ||
        location.country.toLowerCase().includes(normalized);
      const matchesFilter = filter === 'all' || location.tags.includes(filter);
      return matchesQuery && matchesFilter;
    });
  }, [query, filter]);

  return (
    <View style={styles.sectionGroup}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          VPN connections
        </Text>
        <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
          {visibleLocations.length} {visibleLocations.length === 1 ? 'place' : 'places'}
        </Text>
      </View>

      <View
        style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <AppleIcon name="search" size={16} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search city or country..."
          placeholderTextColor={theme.textTertiary}
          style={[styles.searchInput, { color: theme.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}>
            <AppleIcon name="close" size={14} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}>
        {FILTERS.map((item) => {
          const isActive = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: isActive ? theme.palette.blue : theme.gray5,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              <Text
                style={[
                  styles.chipText,
                  {
                    color: isActive ? '#FFFFFF' : theme.text,
                    fontWeight: isActive ? '600' : '500',
                  },
                ]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {visibleLocations.length === 0 && (
          <View style={styles.listEmpty}>
            <AppleIcon name="search" size={20} color={theme.textSecondary} />
            <Text style={[styles.listEmptyText, { color: theme.textSecondary }]}>
              No places match your search.
            </Text>
          </View>
        )}
        {visibleLocations.map((location, index) => {
          const speed = getSpeedTone(location.latencyMs, theme);
          const isSelected = selectedLocation.id === location.id;
          return (
            <Pressable
              key={location.id}
              onPress={() => {
                selectLocation(location);
                // Choosing a place here is also what the Stage 9 tunnel provisions against,
                // so the picker in this list and the switch in Settings describe one server.
                setPreferredServerRegion(location.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${location.city}, ${location.country}`}
              accessibilityState={{ selected: isSelected }}
              style={({ pressed }) => [
                styles.locationRow,
                {
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: theme.separator,
                  backgroundColor: pressed ? theme.gray5 : theme.card,
                },
              ]}>
              <View style={styles.locationLeft}>
                <View
                  style={[styles.flagCircle, { backgroundColor: theme.cardSecondary }]}>
                  <Text style={styles.flagText}>{location.flag}</Text>
                </View>
                <View style={styles.locationTextGroup}>
                  <Text numberOfLines={1} style={[styles.locationCity, { color: theme.text }]}>
                    {location.city}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.locationCountry, { color: theme.textSecondary }]}>
                    {location.country} • {location.latencyMs} ms
                  </Text>
                </View>
              </View>
              <View style={styles.locationRight}>
                {vpnEnabled && tunnelRegionId === location.id ? (
                  <View
                    style={[styles.tunnelBadge, { backgroundColor: theme.blueBadgeBg }]}
                    accessibilityLabel="The VPN tunnel uses this server">
                    <Text style={[styles.tunnelBadgeText, { color: theme.blueBadgeText }]}>
                      VPN
                    </Text>
                  </View>
                ) : null}
                <View
                  style={[styles.speedBadge, { backgroundColor: `${speed.color}1F` }]}>
                  <View style={[styles.speedDot, { backgroundColor: speed.color }]} />
                  <Text style={[styles.speedText, { color: speed.color }]}>
                    {speed.label}
                  </Text>
                </View>
                {isSelected ? (
                  <AppleIcon name="checkmark" size={18} color={theme.palette.blue} />
                ) : (
                  <AppleIcon name="chevron-right" size={18} color={theme.textTertiary} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DataSaverSection() {
  const theme = useAppleTheme();
  const { saverStrength, setSaverStrength, saverApps, toggleSaverApp } = useVpn();

  const activeAppCount = saverApps.filter((app) => app.enabled).length;

  return (
    <View style={styles.sectionGroup}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          Data saver
        </Text>
        <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
          {activeAppCount} {activeAppCount === 1 ? 'app' : 'apps'} active
        </Text>
      </View>

      <View style={[styles.segmented, { backgroundColor: theme.cardSecondary }]}>
        {STRENGTHS.map((item) => {
          const isActive = saverStrength === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setSaverStrength(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.segment,
                isActive && [
                  styles.segmentActive,
                  { backgroundColor: theme.card },
                ],
                pressed && !isActive && { opacity: 0.7 },
              ]}>
              <Text
                style={[
                  styles.segmentText,
                  {
                    color: isActive ? theme.text : theme.textSecondary,
                    fontWeight: isActive ? '600' : '500',
                  },
                ]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.strengthDescription}>
        <AppleIcon name="info" size={14} color={theme.textSecondary} />
        <Text style={[styles.strengthDescriptionText, { color: theme.textSecondary }]}>
          {STRENGTH_DESCRIPTIONS[saverStrength]}
        </Text>
      </View>

      <View
        style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {saverApps.map((app, index) => (
          <SaverAppRow
            key={app.id}
            iconName={app.iconName}
            iconBgColor={app.iconBgColor}
            appName={app.name}
            savedLabel={app.savedLabel}
            value={app.enabled}
            isLast={index === saverApps.length - 1}
            onValueChange={() => toggleSaverApp(app.id)}
          />
        ))}
      </View>
    </View>
  );
}

interface SaverAppRowProps {
  iconName: string;
  iconBgColor: string;
  appName: string;
  savedLabel: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  isLast?: boolean;
}

function SaverAppRow({
  iconName,
  iconBgColor,
  appName,
  savedLabel,
  value,
  onValueChange,
  isLast = false,
}: SaverAppRowProps) {
  const theme = useAppleTheme();

  const icon: IconName =
    iconName === 'tv'
      ? 'tv'
      : iconName === 'music'
        ? 'music'
        : iconName === 'camera'
          ? 'camera'
          : iconName === 'play'
            ? 'play'
            : 'chat';

  return (
    <View
      style={[
        styles.appRow,
        {
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: theme.separator,
        },
      ]}>
      <View style={styles.appRowLeft}>
        <View style={[styles.appIconBox, { backgroundColor: iconBgColor }]}>
          <AppleIcon name={icon} size={16} color="#FFFFFF" />
        </View>
        <View style={styles.appTextGroup}>
          <Text style={[styles.appName, { color: theme.text }]}>{appName}</Text>
          <Text style={[styles.appMeta, { color: theme.textSecondary }]}>
            {savedLabel}
          </Text>
        </View>
      </View>
      <AppleSwitch value={value} onValueChange={onValueChange} accessibilityLabel={appName} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    minHeight: 44,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  avatarButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.lg,
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionGroup: {
    gap: Spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionHint: {
    fontSize: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    height: 42,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  chipScroll: {
    marginHorizontal: -Spacing.md,
    marginTop: Spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.full,
  },
  chipText: {
    fontSize: 13,
  },
  listCard: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    marginTop: Spacing.xs,
  },
  listEmpty: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
  },
  listEmptyText: {
    fontSize: 13,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 60,
    gap: Spacing.sm,
  },
  locationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  flagCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontSize: 20,
  },
  locationTextGroup: {
    flex: 1,
    gap: 1,
  },
  locationCity: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  locationCountry: {
    fontSize: 12,
  },
  locationRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tunnelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  tunnelBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  speedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  speedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  speedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 9,
    padding: 2,
    marginTop: Spacing.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
  },
  strengthDescription: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xxs,
  },
  strengthDescriptionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  appRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    paddingRight: Spacing.sm,
  },
  appIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTextGroup: {
    flex: 1,
  },
  appName: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  appMeta: {
    fontSize: 12,
    marginTop: 1,
  },
});



