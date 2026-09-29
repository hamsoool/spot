import React, { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAppleTheme } from '@/hooks/use-theme';
import { completeOnboarding } from '@/services/onboarding-state';

import { ONBOARDING_SLIDES, OnboardingSlide } from './onboarding-slide';
import { PaginationDots } from './pagination-dots';

const APP_VERSION = '1.0.0';

interface OnboardingScreenProps {
  onDone: () => void;
}

/**
 * First-launch onboarding: swipeable pages with animated dots, a Skip
 * action, and a single primary CTA (Continue → Get Started). Finishing
 * persists the completion flag before revealing the app so a relaunch
 * never replays the flow.
 */
export function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const theme = useAppleTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const settledPage = useRef(0);
  const finishing = useRef(false);
  const [page, setPage] = useState(0);

  const count = ONBOARDING_SLIDES.length;
  const isLast = page === count - 1;

  const goToPage = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(count - 1, next));
      scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    },
    [count, width],
  );

  const handleScroll = useCallback(
    (event: {
      nativeEvent: { contentOffset: { x: number }; layoutMeasurement: { width: number } };
    }) => {
      const pageWidth = event.nativeEvent.layoutMeasurement.width || 1;
      const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
      if (next !== settledPage.current) {
        settledPage.current = next;
        setPage(next);
        Haptics.selectionAsync().catch(() => {});
      }
    },
    [],
  );

  const handleSkip = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    completeOnboarding().finally(onDone);
  }, [onDone]);

  const handlePrimary = useCallback(() => {
    if (finishing.current) return;
    if (!isLast) {
      Haptics.selectionAsync().catch(() => {});
      goToPage(page + 1);
      return;
    }
    finishing.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    completeOnboarding().finally(onDone);
  }, [goToPage, isLast, onDone, page]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]} accessibilityViewIsModal>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={[styles.version, { color: theme.textTertiary }]}>
          spot {APP_VERSION}
        </Text>
        {!isLast ? (
          <Pressable
            onPress={handleSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            hitSlop={12}
            style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
            <Text style={[styles.skipLabel, { color: theme.textSecondary }]}>Skip</Text>
          </Pressable>
        ) : (
          <View style={styles.skipPlaceholder} />
        )}
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}>
        {ONBOARDING_SLIDES.map((slide, index) => (
          <View key={slide.key} style={{ width }}>
            <OnboardingSlide
              hero={slide.hero}
              title={slide.title}
              body={slide.body}
              chip={slide.chip}
              active={index === page}
            />
          </View>
        ))}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PaginationDots
          count={count}
          index={page}
          activeColor={theme.tint}
          inactiveColor={theme.gray5}
        />
        <View style={styles.ctaWrap}>
          <Pressable
            onPress={handlePrimary}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Get started with spot' : 'Continue onboarding'}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: theme.tint },
              pressed && styles.pressed,
            ]}>
            <Text style={styles.ctaLabel}>{isLast ? 'Get Started' : 'Continue'}</Text>
          </Pressable>
        </View>
        <Text style={[styles.footnote, { color: theme.textTertiary }]}>
          No account needed · Your data stays on this device
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 900,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  version: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  skip: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  skipPlaceholder: {
    width: 44,
  },
  skipLabel: {
    fontFamily: Fonts.sans,
    fontSize: 16,
  },
  pressed: {
    opacity: 0.6,
    transform: [{ scale: 0.98 }],
  },
  footer: {
    alignItems: 'center',
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  ctaWrap: {
    width: '100%',
  },
  cta: {
    height: 54,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: '#FFFFFF',
  },
  footnote: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
});
