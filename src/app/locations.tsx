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
import { LOCATIONS, useVpn } from '@/context/vpn-context';
import { AppleIcon } from '@/components/ui/apple-icon';
import { BottomTabInset, MaxContentWidth, Spacing, Radius } from '@/constants/theme';

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

export default function LocationsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAppleTheme();
  const { selectedLocation, selectLocation } = useVpn();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const recommended = LOCATIONS[0];

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

  const bottomPadding = insets.bottom + BottomTabInset + Spacing.xl;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* iOS Navigation Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 12),
            backgroundColor: theme.background,
            borderBottomColor: theme.separator,
          },
        ]}>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Locations</Text>
          <View style={[styles.headerPill, { backgroundColor: theme.blueBadgeBg }]}>
            <Text style={[styles.headerPillText, { color: theme.palette.blue }]}>
              {LOCATIONS.length} sanctuaries
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.contentWrapper}>



          {/* iOS Search Bar */}
          <View
            style={[
              styles.searchBar,
              { backgroundColor: theme.isDark ? theme.gray5 : 'rgba(142, 142, 147, 0.12)' },
            ]}>
            <AppleIcon name="search" size={18} color={theme.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search city or country..."
              placeholderTextColor={theme.textSecondary}
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
                <AppleIcon name="close" size={16} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Recommended Location Card */}
          <View
            style={[
              styles.recommendCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            <View style={styles.recommendHeader}>
              <View style={styles.recommendHeaderLeft}>
                <View style={styles.recommendLabelRow}>
                  <AppleIcon name="leaf" size={14} color={theme.palette.green} />
                  <Text
                    style={[
                      styles.recommendLabel,
                      { color: theme.textSecondary },
                    ]}>
                    Recommended for you
                  </Text>
                </View>
                <Text style={[styles.recommendTitle, { color: theme.text }]}>
                  {recommended.city}, {recommended.country}
                </Text>
              </View>
              <View
                style={[
                  styles.recommendBadge,
                  { backgroundColor: theme.badgeBg },
                ]}>
                <View
                  style={[
                    styles.badgeDot,
                    { backgroundColor: theme.palette.green },
                  ]}
                />
                <Text
                  style={[
                    styles.recommendBadgeText,
                    { color: theme.palette.green },
                  ]}>
                  Fastest
                </Text>
              </View>
            </View>

            <Text style={[styles.recommendNote, { color: theme.textSecondary }]}>
              Optimal for everyday quiet browsing, private streaming, and gentle
              battery consumption.
            </Text>

            <View style={styles.recommendFooter}>
              <View style={styles.recommendServerGroup}>
                <View
                  style={[
                    styles.serverFlagCircle,
                    {
                      backgroundColor: theme.cardSecondary,
                      borderColor: theme.border,
                    },
                  ]}>
                  <Text style={styles.serverFlag}>{recommended.flag}</Text>
                </View>
                <View>
                  <Text style={[styles.serverName, { color: theme.text }]}>
                    Natural Guard
                  </Text>
                  <Text
                    style={[
                      styles.serverMeta,
                      { color: theme.textSecondary },
                    ]}>
                    Always instant • {recommended.latencyMs} ms
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => selectLocation(recommended)}
                accessibilityRole="button"
                accessibilityLabel={`Connect to ${recommended.city}`}
                style={({ pressed }) => [
                  styles.connectButton,
                  { backgroundColor: theme.palette.blue, opacity: pressed ? 0.8 : 1 },
                ]}>
                <Text style={styles.connectButtonText}>
                  {selectedLocation.id === recommended.id ? 'Connected' : 'Connect'}
                </Text>
                <AppleIcon name="arrow-right" size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>


          {/* Filter Chips */}
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

          {/* Section Header */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              Popular Places
            </Text>
            <Text style={[styles.sectionCount, { color: theme.textSecondary }]}>
              {visibleLocations.length}{' '}
              {visibleLocations.length === 1 ? 'sanctuary' : 'sanctuaries'}
            </Text>
          </View>

          {/* Inset Grouped Location List */}
          <View
            style={[
              styles.listCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            {visibleLocations.length === 0 && (
              <View style={styles.emptyState}>
                <AppleIcon name="search" size={22} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No sanctuaries match your search.
                </Text>
              </View>
            )}

            {visibleLocations.map((location, index) => {
              const speed = getSpeedTone(location.latencyMs, theme);
              const isSelected = selectedLocation.id === location.id;
              return (
                <Pressable
                  key={location.id}
                  onPress={() => selectLocation(location)}
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
                      <Text
                        numberOfLines={1}
                        style={[styles.locationCity, { color: theme.text }]}>
                        {location.city}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.locationCountry,
                          { color: theme.textSecondary },
                        ]}>
                        {location.country}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.locationRight}>
                    <View
                      style={[
                        styles.speedBadge,
                        { backgroundColor: `${speed.color}1F` },
                      ]}>
                      <View
                        style={[
                          styles.speedDot,
                          { backgroundColor: speed.color },
                        ]}
                      />
                      <Text style={[styles.speedText, { color: speed.color }]}>
                        {speed.label}
                      </Text>
                    </View>
                    {isSelected ? (
                      <AppleIcon
                        name="checkmark"
                        size={18}
                        color={theme.palette.blue}
                      />
                    ) : (
                      <AppleIcon
                        name="chevron-right"
                        size={18}
                        color={theme.textTertiary}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerPill: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  headerPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: Spacing.sm,
    borderRadius: 12,
    gap: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  recommendCard: {
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  recommendHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  recommendHeaderLeft: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  recommendLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  recommendLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  recommendTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  recommendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recommendBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  recommendNote: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  recommendFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recommendServerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  serverFlagCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  serverFlag: {
    fontSize: 19,
  },
  serverName: {
    fontSize: 14,
    fontWeight: '600',
  },
  serverMeta: {
    fontSize: 12,
    marginTop: 1,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 38,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  connectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  chipScroll: {
    marginBottom: Spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  chipText: {
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xxs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontSize: 12,
  },
  listCard: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.xs,
  },
  emptyText: {
    fontSize: 14,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  locationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  flagCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontSize: 19,
  },
  locationTextGroup: {
    flex: 1,
  },
  locationCity: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  locationCountry: {
    fontSize: 13,
    marginTop: 1,
  },
  locationRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexShrink: 0,
  },
  speedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  speedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  speedText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

