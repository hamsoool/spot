import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppleTheme } from '@/hooks/use-theme';
import {
  DataSaverStrength,
  useVpn,
} from '@/context/vpn-context';
import { AppleIcon, IconName } from '@/components/ui/apple-icon';
import { AppleSwitch } from '@/components/ui/apple-switch';
import { BottomTabInset, MaxContentWidth, Spacing, Radius } from '@/constants/theme';
import { DataUsageCard } from '@/components/data-usage-card';

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

export default function DataSaverScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAppleTheme();
  const { saverStrength, setSaverStrength, saverApps, toggleSaverApp } = useVpn();

  const activeAppCount = saverApps.filter((app) => app.enabled).length;
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
              style={[styles.headerIconCircle, { backgroundColor: theme.badgeBg }]}>
              <AppleIcon name="leaf" size={17} color={theme.palette.green} />
            </View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Terra Guard
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
        showsVerticalScrollIndicator={false}>
        <View style={styles.contentWrapper}>
          {/* Reassuring Greeting Card */}
          <View
            style={[
              styles.card,
              styles.greetingCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            <View
              style={[styles.greetingIconCircle, { backgroundColor: theme.badgeBg }]}>
              <AppleIcon name="leaf" size={22} color={theme.palette.green} />
            </View>
            <View style={styles.greetingTextGroup}>
              <Text style={[styles.greetingTitle, { color: theme.text }]}>
                Breathe easy
              </Text>
              <Text style={[styles.greetingSubtitle, { color: theme.textSecondary }]}>
                Your connection is gentle, quiet, and frugal.
              </Text>
            </View>
          </View>



          {/* Overview Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                marginTop: Spacing.md,
                gap: Spacing.sm,
              },
            ]}>
            <View style={styles.overviewHeader}>
              <View style={styles.overviewHeaderLeft}>
                <Text style={[styles.overviewLabel, { color: theme.textSecondary }]}>
                  Total saved this month
                </Text>
                <View style={styles.overviewValueRow}>
                  <Text style={[styles.overviewValue, { color: theme.text }]}>
                    14.8
                  </Text>
                  <Text style={[styles.overviewUnit, { color: theme.textSecondary }]}>
                    GB
                  </Text>
                </View>
              </View>
              <View style={[styles.optimalBadge, { backgroundColor: theme.badgeBg }]}>
                <AppleIcon name="leaf" size={13} color={theme.palette.green} />
                <Text style={[styles.optimalText, { color: theme.palette.green }]}>
                  Optimal
                </Text>
              </View>
            </View>

            <View style={styles.planProgressGroup}>
              <View style={styles.planProgressLabels}>
                <Text style={[styles.planLabel, { color: theme.textSecondary }]}>
                  Monthly plan
                </Text>
                <Text style={[styles.planValue, { color: theme.text }]}>
                  32 GB used of 50 GB
                </Text>
              </View>
              <View style={[styles.planTrack, { backgroundColor: theme.gray5 }]}>
                <View
                  style={[
                    styles.planFill,
                    { backgroundColor: theme.palette.blue, width: '64%' },
                  ]}
                />
              </View>
            </View>

            <View style={[styles.callout, { backgroundColor: theme.cardSecondary }]}>
              <AppleIcon name="calendar" size={17} color={theme.palette.blue} />
              <Text style={[styles.calloutText, { color: theme.textSecondary }]}>
                You have plenty of data left for the next{' '}
                <Text style={[styles.calloutStrong, { color: theme.text }]}>
                  12 days
                </Text>
                .
              </Text>
            </View>
          </View>

          {/* Saving Strength Section */}
          <View style={styles.sectionGroup}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                Saving strength
              </Text>
              <Text style={[styles.sectionHint, { color: theme.textTertiary }]}>
                Changes apply instantly
              </Text>
            </View>

            <View
              style={[
                styles.card,
                { backgroundColor: theme.card, borderColor: theme.border, gap: Spacing.sm },
              ]}>
              <View style={[styles.segmented, { backgroundColor: theme.gray5 }]}>
                {STRENGTHS.map((item) => {
                  const isActive = saverStrength === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setSaverStrength(item.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      style={[
                        styles.segment,
                        isActive && [
                          styles.segmentActive,
                          { backgroundColor: theme.card },
                        ],
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
                <AppleIcon name="checkmark" size={16} color={theme.palette.blue} />
                <Text
                  style={[
                    styles.strengthDescriptionText,
                    { color: theme.textSecondary },
                  ]}>
                  {STRENGTH_DESCRIPTIONS[saverStrength]}
                </Text>
              </View>
            </View>
          </View>


          {/* Apps Saving Data Section */}
          <View style={styles.sectionGroup}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                Apps saving data
              </Text>
              <Text style={[styles.sectionHint, { color: theme.textTertiary }]}>
                {activeAppCount} active
              </Text>
            </View>

            <View
              style={[
                styles.listCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}>
              {saverApps.map((app, index) => (
                <View
                  key={app.id}
                  style={[
                    styles.appRow,
                    {
                      borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: theme.separator,
                    },
                  ]}>
                  <View style={styles.appRowLeft}>
                    <View style={[styles.appIconBox, { backgroundColor: app.iconBgColor }]}>
                      <AppleIcon
                        name={app.iconName as IconName}
                        size={19}
                        color={app.iconColor}
                      />
                    </View>
                    <View style={styles.appTextGroup}>
                      <Text
                        numberOfLines={1}
                        style={[styles.appName, { color: theme.text }]}>
                        {app.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[styles.appMeta, { color: theme.textSecondary }]}>
                        {app.enabled ? app.savedLabel : 'Not saving data right now'}
                      </Text>
                    </View>
                  </View>
                  <AppleSwitch
                    value={app.enabled}
                    onValueChange={() => toggleSaverApp(app.id)}
                    accessibilityLabel={`Toggle data saver for ${app.name}`}
                  />
                </View>
              ))}
            </View>
          </View>

          {/* Stage 7: real numbers, reading the same native counters the firewall
              itself maintains. Deliberately below the (still mock) per-app list, so
              nothing here can be mistaken for the placeholder "Saved 5.8 GB" copy. */}
          <DataUsageCard />
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
    gap: Spacing.xs,
  },
  headerIconCircle: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
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
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  greetingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  greetingIconCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingTextGroup: {
    flex: 1,
  },
  greetingTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  greetingSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 1,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  overviewHeaderLeft: {
    flex: 1,
  },
  overviewLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  overviewValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 2,
  },
  overviewValue: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  overviewUnit: {
    fontSize: 19,
    fontWeight: '600',
  },
  optimalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  optimalText: {
    fontSize: 12,
    fontWeight: '600',
  },
  planProgressGroup: {
    gap: 6,
    paddingTop: 2,
  },
  planProgressLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planLabel: {
    fontSize: 13,
  },
  planValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  planTrack: {
    width: '100%',
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  planFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: 12,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
  },
  calloutText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  calloutStrong: {
    fontWeight: '600',
  },
  sectionGroup: {
    marginTop: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxs,
    marginBottom: 6,
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
  segmented: {
    flexDirection: 'row',
    borderRadius: 9,
    padding: 2,
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
  listCard: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
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

