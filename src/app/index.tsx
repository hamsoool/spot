import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useAppleTheme } from "@/hooks/use-theme";
import { useVpn } from "@/context/vpn-context";
import { AsciiEarth } from "@/components/ascii-earth";
import { AppleIcon } from "@/components/ui/apple-icon";
import {
  BottomTabInset,
  MaxContentWidth,
  Radius,
  Spacing,
} from "@/constants/theme";

/** Matches the speed tones used on the Locations screen. */
function getLatencyTone(
  latencyMs: number,
  theme: ReturnType<typeof useAppleTheme>
) {
  if (latencyMs <= 50) {
    return { bg: theme.badgeBg, fg: theme.badgeText };
  }
  if (latencyMs <= 150) {
    return { bg: "rgba(255, 149, 0, 0.12)", fg: theme.palette.orange };
  }
  return {
    bg: theme.isDark
      ? "rgba(142, 142, 147, 0.18)"
      : "rgba(142, 142, 147, 0.12)",
    fg: theme.textSecondary,
  };
}

export default function ProtectionScreen() {
  const insets = useSafeAreaInsets();
  const theme = useAppleTheme();
  const router = useRouter();
  const { isConnected, toggleConnection, selectedLocation } = useVpn();

  const activeColor = theme.palette.green;
  const inactiveColor = theme.textSecondary;
  const currentColor = isConnected ? activeColor : inactiveColor;

  // Ambient color driving the glow, ping ring, and status dot.
  const glowRgb = isConnected
    ? theme.isDark
      ? "50, 215, 75"
      : "52, 199, 89"
    : "142, 142, 147";

  const hour = new Date().getHours();
  const greetingText =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // --- Reanimated state -----------------------------------------------------
  const glowOpacity = useSharedValue(isConnected ? 0.9 : 0.55);
  const stateAlpha = useSharedValue(isConnected ? 1 : 0);
  const ringProgress = useSharedValue(0);
  const dotPulse = useSharedValue(0);

  useEffect(() => {
    if (isConnected) {
      stateAlpha.value = withTiming(1, { duration: 500 });
      glowOpacity.value = withRepeat(
        withTiming(1, {
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      );
      ringProgress.value = withRepeat(
        withTiming(1, { duration: 3500, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
      dotPulse.value = withRepeat(
        withTiming(1, {
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      );
    } else {
      cancelAnimation(glowOpacity);
      cancelAnimation(ringProgress);
      cancelAnimation(dotPulse);
      glowOpacity.value = withTiming(0.55, { duration: 400 });
      stateAlpha.value = withTiming(0, { duration: 400 });
      ringProgress.value = withTiming(0, { duration: 300 });
      dotPulse.value = withTiming(0, { duration: 300 });
    }
  }, [isConnected, glowOpacity, stateAlpha, ringProgress, dotPulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: stateAlpha.value * 0.55 * (1 - ringProgress.value),
    transform: [{ scale: 1 + ringProgress.value * 0.1 }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 1 - dotPulse.value * 0.55,
    transform: [{ scale: 1 + dotPulse.value * 0.5 }],
  }));

  // --- Interactions ---------------------------------------------------------
  const handleToggle = () => {
    const willConnect = !isConnected;
    toggleConnection();
    if (Platform.OS !== "web") {
      if (willConnect) {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        ).catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
          () => {}
        );
      }
    }
  };

  const handleOpenLocations = () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    router.push("/data");
  };

  const latencyTone = getLatencyTone(selectedLocation.latencyMs, theme);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.background,
          paddingBottom: insets.bottom + BottomTabInset,
        },
      ]}>
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
              <AppleIcon
                name="shield-check"
                size={18}
                color={theme.blueBadgeText}
              />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                Terra Guard
              </Text>
              <Text
                style={[
                  styles.headerSubtitle,
                  { color: theme.textSecondary },
                ]}>
                Active Protection
              </Text>
            </View>
          </View>
          <View
            style={[styles.avatarButton, { backgroundColor: theme.gray5 }]}>
            <AppleIcon name="person" size={17} color={theme.textSecondary} />
          </View>
        </View>
      </View>

      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={
          isConnected ? "Turn off protection" : "Turn on protection"
        }
        accessibilityHint="Double tap to toggle VPN protection"
        accessibilityState={{ checked: isConnected }}
        style={({ pressed }) => [
          styles.pressArea,
          pressed && { transform: [{ scale: 0.985 }] },
        ]}>
        {/* Greeting */}
        <View style={styles.greeting}>
          <Text style={[styles.greetingTitle, { color: theme.text }]}>
            {greetingText}
          </Text>
          <Text
            style={[styles.greetingSubtitle, { color: theme.textSecondary }]}>
            {isConnected
              ? "Your phone is safe, quiet, and saving data."
              : "Protection is paused. Tap anywhere to resume."}
          </Text>
        </View>

        <View style={styles.centerGroup}>
          {/* ASCII Earth Hero with ambient glow + ping ring */}
          <Animated.View style={styles.hero}>
            <View style={styles.effectsLayer} pointerEvents="none">
              <Animated.View style={[styles.fillCenter, glowStyle]}>
                <View style={[styles.glowCircleXl, { overflow: "hidden" }]}>
                  <LinearGradient
                    colors={[
                      `rgba(${glowRgb}, 0)`,
                      `rgba(${glowRgb}, 0.16)`,
                      `rgba(${glowRgb}, 0)`,
                    ]}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View
                    style={[
                      styles.glowCircleInner,
                      { backgroundColor: `rgba(${glowRgb}, 0.10)` },
                    ]}
                  />
                </View>
              </Animated.View>

              <Animated.View style={[styles.fillCenter, ringStyle]}>
                <View
                  style={[
                    styles.pingRing,
                    { borderColor: `rgba(${glowRgb}, 0.45)` },
                  ]}
                />
              </Animated.View>
            </View>

            <Text style={[styles.statusLabel, { color: currentColor }]}>
              {isConnected ? "Connected" : "Disconnected"}
            </Text>

            <View style={styles.earthContainer}>
              <AsciiEarth
                color={currentColor}
                isRotating={isConnected}
                fontSize={12.5}
              />
            </View>

            <Text style={[styles.stateText, { color: currentColor }]}>
              {isConnected ? "ON" : "OFF"}
            </Text>
          </Animated.View>

          {/* Location row — design-system pill: card surface, pulsing dot,
              latency badge, and a blue Change action. */}
          <Pressable
            onPress={handleOpenLocations}
            accessibilityRole="button"
            accessibilityLabel={`Connected location: ${selectedLocation.city}, ${selectedLocation.country}. Change location`}
            style={({ pressed }) => [
              styles.locationPill,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}>
            <Animated.View
              style={[
                styles.statusDot,
                dotStyle,
                {
                  backgroundColor: isConnected
                    ? theme.palette.green
                    : theme.textTertiary,
                  shadowColor: isConnected
                    ? theme.palette.green
                    : "transparent",
                },
              ]}
            />
            <Text style={styles.flagText}>{selectedLocation.flag}</Text>
            <Text
              style={[styles.locationCity, { color: theme.text }]}
              numberOfLines={1}>
              {selectedLocation.city}
            </Text>
            <Text
              style={[styles.locationSeparator, { color: theme.textTertiary }]}>
              •
            </Text>
            <Text
              style={[styles.locationCountry, { color: theme.textSecondary }]}
              numberOfLines={1}>
              {selectedLocation.country}
            </Text>
            <View
              style={[
                styles.latencyBadge,
                { backgroundColor: latencyTone.bg },
              ]}>
              <AppleIcon
                name="bolt"
                size={11}
                color={latencyTone.fg}
                style={styles.boltIcon}
              />
              <Text style={[styles.latencyText, { color: latencyTone.fg }]}>
                {selectedLocation.latencyMs}ms
              </Text>
            </View>
            <Text style={[styles.changeText, { color: theme.tint }]}>
              Change
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: theme.textTertiary }]}>
          Tap anywhere to {isConnected ? "pause" : "activate"} protection
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerContent: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.3,
    lineHeight: 20,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 14,
    marginTop: 1,
  },
  avatarButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  pressArea: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    alignItems: "center",
    justifyContent: "space-between",
    maxWidth: MaxContentWidth,
    width: "100%",
    alignSelf: "center",
  },
  greeting: {
    width: "100%",
    paddingHorizontal: Spacing.xxs,
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  greetingSubtitle: {
    fontSize: 15,
    lineHeight: 20,
    marginTop: 2,
  },
  centerGroup: {
    alignItems: "center",
    width: "100%",
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xs,
  },
  effectsLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  fillCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  glowCircleXl: {
    width: 320,
    height: 320,
    borderRadius: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  glowCircleInner: {
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  pingRing: {
    width: 208,
    height: 208,
    borderRadius: 104,
    borderWidth: 1,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1.4,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
  },
  earthContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: Spacing.xs,
  },
  stateText: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 3,
    marginTop: Spacing.xs,
  },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 7,
    marginTop: Spacing.xl,
    maxWidth: "100%",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 0,
  },
  flagText: {
    fontSize: 14,
    lineHeight: 18,
  },
  locationCity: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  locationSeparator: {
    fontSize: 11,
    fontWeight: "400",
  },
  locationCountry: {
    fontSize: 13,
    fontWeight: "400",
    letterSpacing: -0.1,
  },
  latencyBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
    gap: 3,
  },
  boltIcon: {
    marginTop: 0.5,
  },
  latencyText: {
    fontSize: 11,
    fontWeight: "600",
  },
  changeText: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 2,
  },
  hint: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.3,
    textAlign: "center",
  },
});
