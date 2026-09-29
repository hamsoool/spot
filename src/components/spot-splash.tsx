import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Fonts, Spacing } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useAppleTheme } from '@/hooks/use-theme';

const LETTERS = ['s', 'p', 'o', 't'];
const BAR_TRACK_WIDTH = 120;
const BAR_WIDTH = 44;

/**
 * Branded launch splash. The native splash (app.json: theme canvas, no image)
 * hands off to this layer color-on-color, so the user perceives one
 * continuous screen while "spot" assembles letter by letter above a hairline
 * progress sweep.
 *
 * Mounted by AppGate for the first ~second of every launch; AppGate unmounts
 * it with a FadeOut exit once the boot gate lifts.
 */
export function SpotSplash() {
  const theme = useAppleTheme();
  const reducedMotion = useReducedMotion();

  const tagProgress = useSharedValue(reducedMotion ? 1 : 0);
  const barProgress = useSharedValue(reducedMotion ? 1 : 0);
  const sweep = useSharedValue(-BAR_WIDTH);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    tagProgress.value = withDelay(430, withTiming(1, { duration: 520 }));
    barProgress.value = withDelay(700, withTiming(1, { duration: 400 }));
    sweep.value = withDelay(
      700,
      withRepeat(
        withTiming(BAR_TRACK_WIDTH, { duration: 1150, easing: Easing.inOut(Easing.ease) }),
        -1,
        false,
      ),
    );
  }, [reducedMotion, tagProgress, barProgress, sweep]);

  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagProgress.value,
    transform: [{ translateY: (1 - tagProgress.value) * 10 }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    opacity: barProgress.value,
    transform: [{ translateX: sweep.value }],
  }));

  return (
    <View
      style={[styles.root, { backgroundColor: theme.background }]}
      accessible
      accessibilityRole="none"
      accessibilityLabel="Loading spot"
      accessibilityViewIsModal>
      <View style={styles.lockup}>
        <View style={styles.wordmarkRow}>
          {LETTERS.map((letter, index) => (
            <WordmarkLetter key={letter} char={letter} index={index} />
          ))}
          <Text style={[styles.wordmark, styles.accent, { color: theme.tint }]}>.</Text>
        </View>
        <Animated.Text style={[styles.tagline, { color: theme.textSecondary }, tagStyle]}>
          Private by default.
        </Animated.Text>
      </View>
      <View style={styles.barZone}>
        <View style={[styles.track, { backgroundColor: theme.gray5 }]}>
          <Animated.View
            style={[styles.bar, { backgroundColor: theme.tint }, barStyle]}
          />
        </View>
      </View>
    </View>
  );
}

function WordmarkLetter({ char, index }: { char: string; index: number }) {
  const theme = useAppleTheme();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    progress.value = withDelay(
      110 + index * 70,
      withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) }),
    );
  }, [index, reducedMotion, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 16 },
      { scale: 0.92 + progress.value * 0.08 },
    ],
  }));

  return (
    <Animated.Text style={[styles.wordmark, { color: theme.text }, style]}>
      {char}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: {
    alignItems: 'center',
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordmark: {
    fontFamily: Fonts.sans,
    fontSize: 64,
    fontWeight: '700',
    letterSpacing: -2.5,
    lineHeight: 72,
  },
  accent: {
    letterSpacing: 0,
  },
  tagline: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.6,
    marginTop: Spacing.sm,
  },
  barZone: {
    position: 'absolute',
    bottom: 96,
    alignItems: 'center',
  },
  track: {
    width: BAR_TRACK_WIDTH,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  bar: {
    width: BAR_WIDTH,
    height: 3,
    borderRadius: 2,
  },
});
