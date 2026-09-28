import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppleIcon } from "@/components/ui/apple-icon";
import { Radius, Spacing } from "@/constants/theme";
import { useAppleTheme } from "@/hooks/use-theme";
import { useBatteryOptimization } from "@/hooks/use-battery-optimization";

/**
 * Stage 6: OEM battery-manager onboarding.
 *
 * The framing has to be honest. On MIUI/HyperOS, ColorOS and FuntouchOS a firewall that
 * Android has not whitelisted gets killed within minutes, and the user never sees it
 * happen. So this card asks for two specific things rather than "better battery life":
 *
 *  1. exemption from Doze / App Standby — a documented AOSP API, the part that works
 *     everywhere;
 *  2. a vendor autostart whitelist — no public API exists, the screen can be renamed or
 *     removed by any OTA, so the written steps are the primary interface and the button
 *     is a convenience that may legitimately do nothing.
 *
 * All copy lives here rather than in Kotlin so it can be reworded without a rebuild.
 */
const VENDOR_STEPS: Record<string, string[]> = {
  xiaomi: [
    "Open Security → Permissions → Autostart and enable Spot.",
    "Set Spot's battery saver to No restrictions in the same app.",
    "In Recents, swipe down on Spot's card to lock it so MIUI stops clearing it.",
  ],
  oppo: [
    "Open Settings → Battery → App battery management → Spot.",
    "Allow auto-launch and background running for Spot.",
    "Turn battery optimization off for Spot.",
  ],
  vivo: [
    "Open Settings → Battery → Background power consumption management.",
    "Set Spot to Allow background usage.",
    "Enable auto-start for Spot under i Manager → App manager.",
  ],
  huawei: [
    "Open Settings → Battery → App launch → Spot.",
    "Turn off Manage automatically, then enable Auto-launch, Secondary launch and Run in background.",
    "Add Spot to Protected apps in Battery → More settings.",
  ],
  samsung: [
    "Open Settings → Battery → Background usage limits.",
    "Make sure Spot is not in Sleeping apps or Deep sleeping apps.",
    "Set Spot to Unrestricted and turn off Put unused apps to sleep.",
  ],
  oneplus: [
    "Open Settings → Battery → Battery optimization → Spot → Don't optimize.",
    "Allow Spot to auto-launch in Settings → Apps → Auto-launch.",
  ],
};

const GENERIC_STEPS = [
  "Open Settings → Battery → Battery optimization.",
  "Find Spot and choose Don't optimize / Unrestricted.",
  "On some phones, also disable “remove permissions if unused”.",
];

export function BatteryOptimizationCard() {
  const theme = useAppleTheme();
  const { batteryStatusAvailable, status, requestExemption, openAutostart } =
    useBatteryOptimization();
  // Local, because these notices describe what just happened on *this* device and
  // would be wrong anywhere else on the screen.
  const [notice, setNotice] = useState<string | null>(null);

  const exempt = status?.ignoringBatteryOptimizations ?? false;

  const onRequestExemption = useCallback(async () => {
    setNotice(null);
    const direct = await requestExemption();
    if (direct === null) {
      setNotice("Android refused the request. Use the steps below.");
    } else if (direct) {
      setNotice("Choose Allow, then come back — this card re-checks by itself.");
    } else {
      setNotice("No exemption dialog on this phone. Find Spot in the list and allow it.");
    }
  }, [requestExemption]);

  const onOpenAutostart = useCallback(async () => {
    setNotice(null);
    const screen = await openAutostart();
    if (screen === null) {
      setNotice("This phone exposes no autostart screen. Use the steps below.");
    }
  }, [openAutostart]);

  // No module (Expo Go, web): nothing to say, so say nothing.
  if (!batteryStatusAvailable) return null;

  const steps = (status?.vendor && VENDOR_STEPS[status.vendor]) || GENERIC_STEPS;

  return (
    <View style={styles.group}>
      <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>
        Keeping the firewall alive
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.headerRow}>
          <View style={[styles.iconBox, { backgroundColor: theme.palette.orange }]}>
            <AppleIcon name="bolt" size={16} color="#FFFFFF" />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: theme.text }]}>
              {status === null ? "Checking this phone…" : status.model || "This phone"}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {status === null
                ? "Reading battery settings"
                : exempt
                  ? "Excluded from battery optimization"
                  : "Battery optimization may kill the firewall"}
            </Text>
          </View>
          {status !== null ? (
            <View
              style={[
                styles.stateBadge,
                { backgroundColor: exempt ? theme.badgeBg : theme.cardSecondary },
              ]}>
              <Text
                style={[
                  styles.stateBadgeText,
                  { color: exempt ? theme.palette.green : theme.textSecondary },
                ]}>
                {exempt ? "Exempt" : "At risk"}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Android may stop the firewall in the background to save battery. Exempting Spot
          keeps protection running; the trade-off is that the firewall stays active.
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={() => void onRequestExemption()}
            disabled={exempt}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: exempt ? theme.cardSecondary : theme.palette.blue,
                opacity: pressed ? 0.8 : 1,
              },
            ]}>
            <Text
              style={[
                styles.primaryButtonText,
                { color: exempt ? theme.textSecondary : "#FFFFFF" },
              ]}>
              {exempt ? "Already exempt" : "Allow background running"}
            </Text>
          </Pressable>
          {status?.autostartAvailable ? (
            <Pressable
              onPress={() => void onOpenAutostart()}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Text style={[styles.secondaryButtonText, { color: theme.palette.blue }]}>
                Open autostart list
              </Text>
            </Pressable>
          ) : null}
        </View>

        {notice ? (
          <Text style={[styles.notice, { color: theme.textSecondary }]}>{notice}</Text>
        ) : null}

        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={[styles.stepIndex, { backgroundColor: theme.cardSecondary }]}>
                <Text style={[styles.stepIndexText, { color: theme.textSecondary }]}>
                  {index + 1}
                </Text>
              </View>
              <Text style={[styles.stepText, { color: theme.text }]}>{step}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.sm },
  groupLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: Spacing.xs,
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  headerText: { flex: 1, gap: 2 },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "600" },
  subtitle: { fontSize: 13 },
  stateBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  stateBadgeText: { fontSize: 12, fontWeight: "600" },
  body: { fontSize: 13, lineHeight: 19 },
  actions: { gap: Spacing.xs },
  primaryButton: {
    height: 42,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontSize: 15, fontWeight: "600" },
  secondaryButton: {
    height: 42,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { fontSize: 15, fontWeight: "600" },
  notice: { fontSize: 12, lineHeight: 17 },
  steps: { gap: Spacing.xs, paddingTop: Spacing.xxs },
  stepRow: { flexDirection: "row", gap: Spacing.xs, alignItems: "flex-start" },
  stepIndex: {
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndexText: { fontSize: 11, fontWeight: "700" },
  stepText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
