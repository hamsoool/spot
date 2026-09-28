import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppleTheme } from '@/hooks/use-theme';
import { useVpn } from '@/context/vpn-context';
import { AppleIcon, IconName } from '@/components/ui/apple-icon';
import { AppleSwitch } from '@/components/ui/apple-switch';
import { BottomTabInset, MaxContentWidth, Spacing, Radius } from '@/constants/theme';
import { BatteryOptimizationCard } from '@/components/battery-optimization-card';

interface ToggleRowProps {
  icon: IconName;
  iconColor: string;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  isLast?: boolean;
}

function ToggleRow({
  icon,
  iconColor,
  title,
  description,
  value,
  onValueChange,
  isLast = false,
}: ToggleRowProps) {
  const theme = useAppleTheme();

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: theme.separator,
        },
      ]}>
      <View style={styles.rowLeading}>
        <View style={[styles.rowIconBox, { backgroundColor: iconColor }]}>
          <AppleIcon name={icon} size={16} color="#FFFFFF" />
        </View>
        <View style={styles.rowTextGroup}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.rowDescription, { color: theme.textSecondary }]}>
            {description}
          </Text>
        </View>
      </View>
      <AppleSwitch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={title}
      />
    </View>
  );
}

interface LinkRowProps {
  icon: IconName;
  iconColor: string;
  title: string;
  trailingText?: string;
  onPress?: () => void;
  isLast?: boolean;
}

function LinkRow({
  icon,
  iconColor,
  title,
  trailingText,
  onPress,
  isLast = false,
}: LinkRowProps) {
  const theme = useAppleTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: theme.separator,
          backgroundColor: pressed && onPress ? theme.gray5 : 'transparent',
        },
      ]}>
      <View style={styles.rowLeading}>
        <View style={[styles.rowIconBox, { backgroundColor: iconColor }]}>
          <AppleIcon name={icon} size={16} color="#FFFFFF" />
        </View>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
      </View>
      {trailingText ? (
        <Text style={[styles.rowTrailingText, { color: theme.textSecondary }]}>
          {trailingText}
        </Text>
      ) : (
        <AppleIcon name="chevron-right" size={18} color={theme.textTertiary} />
      )}
    </Pressable>
  );
}



export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAppleTheme();
  const {
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
    selectedLocation,
    isConnected,
  } = useVpn();

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
            borderBottomColor: theme.separator,
          },
        ]}>
        <View style={styles.headerContent}>
          <View style={styles.headerSpacer} />
          <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
          <View style={[styles.headerSpacer, styles.headerTrailing]}>
            <View style={[styles.avatarButton, { backgroundColor: theme.gray5 }]}>
              <AppleIcon name="person" size={15} color={theme.textSecondary} />
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.contentWrapper}>
          {/* Connection Summary */}
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            <View style={styles.summaryInfo}>
              <Text style={[styles.summaryTitle, { color: theme.text }]}>
                {selectedLocation.flag} {selectedLocation.serverName}
              </Text>
              <Text style={[styles.summarySubtitle, { color: theme.textSecondary }]}>
                {isConnected ? 'Protected' : 'Paused'} • {selectedLocation.latencyMs} ms
                latency
              </Text>
            </View>
            <View style={[styles.summaryBadge, { backgroundColor: theme.blueBadgeBg }]}>
              <Text style={[styles.summaryBadgeText, { color: theme.palette.blue }]}>
                v2.4
              </Text>
            </View>
          </View>

          {/* Group 1: Safety & Privacy */}
          <View style={styles.group}>
            <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>
              Safety &amp; Privacy
            </Text>
            <View
              style={[
                styles.groupCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}>
              <ToggleRow
                icon="wifi-lock"
                iconColor={theme.palette.blue}
                title="Public Wi-Fi Protection"
                description="Automatically protect on public networks"
                value={publicWifiProtection}
                onValueChange={setPublicWifiProtection}
              />
              <ToggleRow
                icon="pause"
                iconColor={theme.palette.orange}
                title="Pause on Drop"
                description="Prevents exposing location when connection drops"
                value={pauseOnDrop}
                onValueChange={setPauseOnDrop}
              />
              <ToggleRow
                icon="block"
                iconColor={theme.palette.purple}
                title="Block Ads & Trackers"
                description="Stops intrusive trackers and saves battery"
                value={blockTrackers}
                onValueChange={setBlockTrackers}
                isLast
              />
            </View>
          </View>

          {/* Group 2: Data Saving */}
          <View style={styles.group}>
            <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>
              Data Saving
            </Text>
            <View
              style={[
                styles.groupCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}>
              <ToggleRow
                icon="tv"
                iconColor={theme.palette.teal}
                title="Video Quality Saver"
                description="Optimizes stream bitrate for mobile networks"
                value={videoQualitySaver}
                onValueChange={setVideoQualitySaver}
              />
              <ToggleRow
                icon="image"
                iconColor={theme.palette.green}
                title="Compress Pictures"
                description="Accelerates web image rendering"
                value={compressPictures}
                onValueChange={setCompressPictures}
                isLast
              />
            </View>
          </View>


          {/* Group 3: OEM battery onboarding (Stage 6) — reads every answer from the
              device, since both grants happen in Settings rather than in a dialog. */}
          <BatteryOptimizationCard />

          {/* Group 4: Help & Support */}
          <View style={styles.group}>
            <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>
              Help &amp; Support
            </Text>
            <View
              style={[
                styles.groupCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}>
              <LinkRow
                icon="book"
                iconColor={theme.palette.blue}
                title="How it works"
                onPress={() => {}}
              />
              <LinkRow
                icon="chat"
                iconColor={theme.palette.green}
                title="Send feedback"
                onPress={() => {}}
              />
              <LinkRow
                icon="info"
                iconColor={theme.textSecondary}
                title="Version"
                trailingText="2.4"
                isLast
              />
            </View>
          </View>

          {/* Footnote */}
          <Text style={[styles.footnote, { color: theme.textSecondary }]}>
            Your browsing habits are encrypted and never recorded or shared.
          </Text>
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
    paddingHorizontal: Spacing.md,
  },
  headerSpacer: {
    width: 64,
  },
  headerTrailing: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  avatarButton: {
    width: 28,
    height: 28,
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
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  summarySubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  summaryBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  summaryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  group: {
    gap: 6,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.xxs,
  },
  groupCard: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 56,
  },
  rowLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    paddingRight: Spacing.sm,
  },
  rowIconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextGroup: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  rowDescription: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  rowTrailingText: {
    fontSize: 15,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxs,
  },
});

