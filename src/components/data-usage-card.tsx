import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppleIcon } from "@/components/ui/apple-icon";
import { Radius, Spacing } from "@/constants/theme";
import { useAppleTheme } from "@/hooks/use-theme";
import { useDataUsage } from "@/hooks/use-data-usage";
import { vpnEvents, type DataUsageWindow } from "@/native/VpnFirewall";

/**
 * Stage 7 dashboard card.
 *
 * Two numbers are shown and they are not interchangeable:
 *  * "Blocked" is our own sinkhole counter — bytes captured and thrown away, which
 *    never reached the radio. It is the only figure this app is entitled to call saved.
 *  * "Used" is what Android reports for the whole device over the same window, so the
 *    user can see the block in context instead of taking our word for it.
 *
 * Per-app blocked time is only claimed for apps this build has actually watched; an app
 * that has never been in the bypass set shows a dash, because the OS can say how many
 * bytes an app used but never why it used none.
 */
function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}

export function DataUsageCard() {
  const theme = useAppleTheme();
  const [window, setWindow] = useState<DataUsageWindow>("today");
  // The app in the foreground is the one most likely to matter, and the only candidate
  // this build can name: the allow-list is still context state (see A4 in the plan).
  const [foreground, setForeground] = useState<string | null>(null);

  useEffect(() => {
    const subscription = vpnEvents.addListener((event) => {
      if (event.type === "foregroundAppChanged") setForeground(event.payload.packageName);
    });
    return () => subscription.remove();
  }, []);

  const { dataUsageAvailable, snapshot, isLoading, isRefreshing, lastError, refresh } =
    useDataUsage({
      packages: foreground ? [foreground] : [],
      window,
    });

  // No module (Expo Go, web): there is nothing to measure.
  if (!dataUsageAvailable) return null;

  const apps = snapshot?.apps ?? [];
  const missingUsageAccess = snapshot !== null && !snapshot.hasUsageAccess;

  return (
    <View style={styles.group}>
      <View style={styles.headerRow}>
        <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>Data usage</Text>
        <View style={[styles.segment, { backgroundColor: theme.cardSecondary }]}>
          {(["today", "week"] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => setWindow(option)}
              accessibilityRole="button"
              style={[
                styles.segmentItem,
                window === option && { backgroundColor: theme.card },
              ]}>
              <Text
                style={[
                  styles.segmentText,
                  { color: window === option ? theme.text : theme.textSecondary },
                ]}>
                {option === "today" ? "Today" : "7 days"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.palette.green }]}>
              {isLoading ? "…" : formatBytes(snapshot?.droppedBytes)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Blocked</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.separator }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {isLoading ? "…" : formatBytes(snapshot?.mobileBytes)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
              Mobile used
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.separator }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {isLoading ? "…" : apps.length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Apps</Text>
          </View>
        </View>

        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Blocked means data the firewall dropped before it reached the network
          {snapshot?.running ? "" : " — the firewall is currently off"}.
        </Text>

        {missingUsageAccess ? (
          <Text style={[styles.body, { color: theme.palette.orange }]}>
            Usage Access is off, so Android will not report per-app numbers. The blocked
            total above is still ours and still accurate.
          </Text>
        ) : null}

        {lastError ? (
          <Text style={[styles.body, { color: theme.palette.orange }]}>{lastError}</Text>
        ) : null}

        <Pressable
          onPress={() => void refresh()}
          disabled={isRefreshing}
          accessibilityRole="button"
          style={styles.refreshRow}>
          <AppleIcon name="calendar" size={14} color={theme.palette.blue} />
          <Text style={[styles.refreshText, { color: theme.palette.blue }]}>
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </Text>
        </Pressable>

        {apps.length > 0 ? (
          <View style={[styles.apps, { borderTopColor: theme.separator }]}>
            {apps.map((app) => (
              <View key={app.packageName} style={styles.appRow}>
                <View style={styles.appText}>
                  <Text numberOfLines={1} style={[styles.appName, { color: theme.text }]}>
                    {app.label ?? app.packageName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.appMeta, { color: theme.textSecondary }]}>
                    blocked {formatDuration(app.blockedMillis)}
                  </Text>
                </View>
                <Text style={[styles.appBytes, { color: theme.text }]}>
                  {formatBytes(app.bytes)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.body, { color: theme.textTertiary }]}>
            {missingUsageAccess
              ? "Per-app numbers need Usage Access."
              : "Nothing measured yet — leave the firewall on for a while."}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.sm },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: Spacing.xs,
  },
  segment: { flexDirection: "row", padding: 2, borderRadius: Radius.pill },
  segmentItem: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  segmentText: { fontSize: 12, fontWeight: "600" },
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  stats: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontWeight: "700" },
  statLabel: { fontSize: 12 },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: Spacing.xxs,
  },
  body: { fontSize: 13, lineHeight: 19 },
  refreshRow: { flexDirection: "row", alignItems: "center", gap: Spacing.xxs },
  refreshText: { fontSize: 13, fontWeight: "600" },
  apps: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.xs,
    gap: Spacing.xs,
  },
  appRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  appText: { flex: 1, gap: 1 },
  appName: { fontSize: 15, fontWeight: "500" },
  appMeta: { fontSize: 12 },
  appBytes: { fontSize: 14, fontWeight: "600" },
});
