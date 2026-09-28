import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppleTheme } from '@/hooks/use-theme';
import { useVpn } from '@/context/vpn-context';
import { AppleIcon } from '@/components/ui/apple-icon';
import { BottomTabInset, MaxContentWidth, Spacing, Radius } from '@/constants/theme';

export default function ProtectionScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAppleTheme();
  const router = useRouter();
  const { isConnected, toggleConnection, selectedLocation } = useVpn();

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
          <View style={styles.headerTitleGroup}>
            <View
              style={[
                styles.headerIconCircle,
                { backgroundColor: theme.blueBadgeBg },
              ]}>
              <AppleIcon name="shield-check" size={18} color={theme.palette.blue} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                Terra Guard
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
                Active Protection
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.avatarButton,
              { backgroundColor: theme.gray5 },
            ]}>
            <AppleIcon name="person" size={17} color={theme.textSecondary} />
          </View>
        </View>
      </View>

      {/* Main Scroll Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: bottomPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.contentWrapper}>
          {/* Greeting Section */}
          <View style={styles.greetingSection}>
            <Text style={[styles.greetingTitle, { color: theme.text }]}>
              Good afternoon, Sarah
            </Text>
            <Text style={[styles.greetingSubtitle, { color: theme.textSecondary }]}>
              {isConnected
                ? 'Your phone is safe, quiet, and saving data.'
                : 'Protection is paused. Tap below to resume.'}
            </Text>
          </View>

          {/* Central Shield Toggle Hero */}
          <View style={styles.heroSection}>
            <View
              style={[
                styles.glowRing,
                {
                  borderColor: isConnected
                    ? 'rgba(52, 199, 89, 0.22)'
                    : 'rgba(142, 142, 147, 0.16)',
                  backgroundColor: isConnected
                    ? 'rgba(52, 199, 89, 0.08)'
                    : 'rgba(142, 142, 147, 0.05)',
                },
              ]}
            />

            <Pressable
              onPress={toggleConnection}
              accessibilityRole="button"
              accessibilityLabel={isConnected ? 'Pause VPN Protection' : 'Connect VPN Protection'}
              style={({ pressed }) => [
                styles.shieldButton,
                {
                  backgroundColor: isConnected
                    ? theme.palette.green
                    : theme.isDark
                    ? '#3A3A3C'
                    : '#8E8E93',
                  shadowColor: isConnected ? theme.palette.green : '#000000',
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}>
              <View style={styles.shieldIconPill}>
                <AppleIcon
                  name={isConnected ? 'shield-check' : 'shield'}
                  size={38}
                  color="#FFFFFF"
                />
              </View>
              <Text style={styles.shieldStatusText}>
                {isConnected ? 'Connected' : 'Paused'}
              </Text>
              <Text style={styles.shieldSubText}>
                {isConnected ? 'Protected • Tap to pause' : 'Tap to resume'}
              </Text>
            </Pressable>
          </View>



          {/* Quick Location Switch Pill */}
          <View style={styles.locationPillContainer}>
            <Pressable
              onPress={() => router.push('/locations')}
              accessibilityRole="button"
              accessibilityLabel="Change location"
              style={({ pressed }) => [
                styles.locationPill,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: isConnected
                      ? theme.palette.green
                      : theme.textTertiary,
                  },
                ]}
              />
              <Text style={styles.flagEmoji}>{selectedLocation.flag}</Text>
              <Text style={[styles.locationPillText, { color: theme.text }]}>
                {selectedLocation.city} •{' '}
                {isConnected ? 'Safe connection' : 'Disconnected'}
              </Text>
              <View style={styles.latencyBadge}>
                <Text style={[styles.latencyText, { color: theme.palette.green }]}>
                  {selectedLocation.latencyMs} ms
                </Text>
              </View>
              <Text style={[styles.changeText, { color: theme.palette.blue }]}>
                Change
              </Text>
            </Pressable>
          </View>

          {/* Feature Cards Grid */}
          <View style={styles.cardsContainer}>
            {/* Card 1: Data Saved Today */}
            <Pressable
              onPress={() => router.push('/data-saver')}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <View style={styles.cardHeaderRow}>
                <View
                  style={[
                    styles.cardIconBox,
                    { backgroundColor: theme.blueBadgeBg },
                  ]}>
                  <AppleIcon name="leaf" size={20} color={theme.palette.blue} />
                </View>
                <View style={styles.cardHeaderFlex}>
                  <View style={styles.cardBadgeRow}>
                    <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
                      Data Saved Today
                    </Text>
                    <View
                      style={[
                        styles.microBadge,
                        { backgroundColor: theme.blueBadgeBg },
                      ]}>
                      <Text
                        style={[styles.microBadgeText, { color: theme.palette.blue }]}>
                        +35% vs yesterday
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.cardValue, { color: theme.text }]}>1.4 GB</Text>
                  <Text
                    style={[styles.cardDescription, { color: theme.textSecondary }]}>
                    About 45 minutes of smooth video saved on your mobile plan.
                  </Text>
                  <View
                    style={[styles.progressBarTrack, { backgroundColor: theme.gray5 }]}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { backgroundColor: theme.palette.blue, width: '68%' },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </Pressable>


            {/* Card 2: Protection Status */}
            <View
              style={[
                styles.card,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}>
              <View style={styles.cardHeaderRow}>
                <View
                  style={[styles.cardIconBox, { backgroundColor: theme.badgeBg }]}>
                  <AppleIcon
                    name="shield-check"
                    size={20}
                    color={theme.palette.green}
                  />
                </View>
                <View style={styles.cardHeaderFlex}>
                  <View style={styles.cardBadgeRow}>
                    <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
                      Protection Status
                    </Text>
                    <View
                      style={[styles.microBadge, { backgroundColor: theme.badgeBg }]}>
                      <Text
                        style={[
                          styles.microBadgeText,
                          { color: theme.palette.green },
                        ]}>
                        All clear
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.cardValue, { color: theme.text }]}>
                    12 trackers stopped
                  </Text>
                  <Text
                    style={[styles.cardDescription, { color: theme.textSecondary }]}>
                    Websites couldn&apos;t follow you around or show pushy pop-up ads
                    today.
                  </Text>
                </View>
              </View>
            </View>

            {/* Card 3: Network Security */}
            <Pressable
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <View style={styles.networkRow}>
                <View style={styles.networkLeft}>
                  <View
                    style={[styles.cardIconBox, { backgroundColor: theme.gray5 }]}>
                    <AppleIcon name="wifi-lock" size={19} color={theme.text} />
                  </View>
                  <View style={styles.networkTextGroup}>
                    <Text
                      numberOfLines={1}
                      style={[styles.networkTitle, { color: theme.text }]}>
                      Home Coffee Shop Wi-Fi
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.networkSubtitle,
                        { color: theme.textSecondary },
                      ]}>
                      Auto-protected automatically
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.verifiedBadge,
                    { backgroundColor: theme.blueBadgeBg },
                  ]}>
                  <AppleIcon
                    name="checkmark"
                    size={11}
                    color={theme.palette.blue}
                  />
                  <Text
                    style={[styles.verifiedText, { color: theme.palette.blue }]}>
                    Verified
                  </Text>
                </View>
              </View>
            </Pressable>
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
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
    lineHeight: 20,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
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
  },
  greetingSection: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xxs,
  },
  greetingTitle: {
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  greetingSubtitle: {
    fontSize: 15,
    marginTop: 4,
    lineHeight: 20,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.xl,
    height: 210,
  },
  glowRing: {
    position: 'absolute',
    width: 218,
    height: 218,
    borderRadius: 109,
    borderWidth: 1.5,
  },
  shieldButton: {
    width: 172,
    height: 172,
    borderRadius: 86,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 8,
  },
  shieldIconPill: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  shieldStatusText: {
    fontSize: 19,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  shieldSubText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  locationPillContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 7,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  flagEmoji: {
    fontSize: 14,
  },
  locationPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  latencyBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
  },
  latencyText: {
    fontSize: 11,
    fontWeight: '600',
  },
  changeText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 2,
  },
  cardsContainer: {
    gap: Spacing.sm,
    width: '100%',
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderFlex: {
    flex: 1,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  microBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  microBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  networkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    paddingRight: Spacing.xs,
  },
  networkTextGroup: {
    flex: 1,
  },
  networkTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  networkSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

