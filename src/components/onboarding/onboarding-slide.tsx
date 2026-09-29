import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { AppleIcon, type IconName } from '@/components/ui/apple-icon';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useAppleTheme } from '@/hooks/use-theme';

import { renderSlideHero } from './onboarding-slide-hero';

export const ONBOARDING_SLIDES: {
  key: string;
  title: string;
  body: string;
  hero: 'shield' | 'earth' | 'bolt';
  chip: { icon: IconName; label: string };
}[] = [
  {
    key: 'protection',
    title: 'Protection that runs itself',
    body: 'spot blocks trackers, watches risky apps, and guards you on public Wi-Fi — without a single setting to learn.',
    hero: 'shield',
    chip: { icon: 'shield-check', label: 'Always-on firewall' },
  },
  {
    key: 'locations',
    title: 'Pick a spot anywhere',
    body: 'Route through fast servers in 40+ countries. One tap, and your traffic leaves from somewhere else.',
    hero: 'earth',
    chip: { icon: 'globe', label: '40+ countries' },
  },
  {
    key: 'data-saver',
    title: 'Saves data on purpose',
    body: 'Compress video and photos on the fly, and pause the moment your connection drops — your plan lasts longer.',
    hero: 'bolt',
    chip: { icon: 'bolt', label: 'Smart data saver' },
  },
];

interface OnboardingSlideProps {
  hero: 'shield' | 'earth' | 'bolt';
  title: string;
  body: string;
  chip: { icon: IconName; label: string };
  active: boolean;
}

/**
 * One onboarding page: hero illustration, title, body, and a capability chip.
 * Content animates in with a staggered rise whenever the page becomes active.
 */
export function OnboardingSlide({ hero, title, body, chip, active }: OnboardingSlideProps) {
  const theme = useAppleTheme();
  const reducedMotion = useReducedMotion();

  const heroProgress = useSharedValue(active && !reducedMotion ? 0 : 1);
  const bodyProgress = useSharedValue(active && !reducedMotion ? 0 : 1);

  useEffect(() => {
    if (!active) return;
    if (reducedMotion) {
      heroProgress.value = 1;
      bodyProgress.value = 1;
      return;
    }
    heroProgress.value = 0;
    bodyProgress.value = 0;
    heroProgress.value = withTiming(1, { duration: 420 });
    bodyProgress.value = withDelay(90, withTiming(1, { duration: 420 }));
  }, [active, reducedMotion, heroProgress, bodyProgress]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroProgress.value,
    transform: [{ translateY: (1 - heroProgress.value) * 18 }],
  }));

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: bodyProgress.value,
    transform: [{ translateY: (1 - bodyProgress.value) * 14 }],
  }));

  return (
    <View style={styles.slide} accessibilityLabel={`${title}. ${body}`}>
      <Animated.View style={[styles.heroWrap, heroStyle]}>
        {renderSlideHero(hero, theme)}
      </Animated.View>
      <Animated.View style={[styles.copy, bodyStyle]}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{body}</Text>
        <SlideChip icon={chip.icon} label={chip.label} />
      </Animated.View>
    </View>
  );
}

function SlideChip({ icon, label }: { icon: IconName; label: string }) {
  const theme = useAppleTheme();
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: theme.blueBadgeBg, borderColor: theme.border },
      ]}>
      {/* AppleIcon rendered by the parent theme context; avoid extra hook-free text use */}
      <AppleIcon name={icon} size={14} color={theme.blueBadgeText} />
      <Text style={[styles.chipLabel, { color: theme.blueBadgeText }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  heroWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 300,
  },
  copy: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 34,
    textAlign: 'center',
  },
  body: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: Spacing.sm,
    maxWidth: 320,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
