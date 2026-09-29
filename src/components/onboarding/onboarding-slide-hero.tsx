import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AsciiEarth } from '@/components/ascii-earth';
import { AppleIcon, type IconName } from '@/components/ui/apple-icon';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import type { useAppleTheme } from '@/hooks/use-theme';

type AppleTheme = ReturnType<typeof useAppleTheme>;
type HeroKind = 'shield' | 'earth' | 'bolt';

/**
 * Hero illustrations for the onboarding slides, drawn from the app's own
 * visual language: gradient tiles, the rotating ASCII earth, and design
 * system iconography. No image assets to ship or localize.
 */
export function renderSlideHero(hero: HeroKind, theme: AppleTheme) {
  if (hero === 'earth') {
    return (
      <View style={styles.earthStage}>
        <View style={styles.earthGlow} pointerEvents="none">
          <LinearGradient
            colors={[
              'rgba(10, 132, 255, 0)',
              'rgba(10, 132, 255, 0.22)',
              'rgba(10, 132, 255, 0)',
            ]}
            locations={[0, 0.5, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <AsciiEarth color={theme.isDark ? theme.blueBadgeText : theme.tint} fontSize={11.5} />
        <View
          style={[styles.locationPin, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.pinDot, { backgroundColor: theme.palette.green }]} />
          <Text style={[styles.pinText, { color: theme.text }]}>Singapore</Text>
          <Text style={[styles.pinMs, { color: theme.badgeText }]}>24 ms</Text>
        </View>
      </View>
    );
  }

  const icon: IconName = hero === 'shield' ? 'shield-check' : 'bolt';
  const glow: [string, string] =
    hero === 'shield'
      ? ['rgba(52, 199, 89, 0.28)', 'rgba(52, 199, 89, 0)']
      : ['rgba(255, 149, 0, 0.28)', 'rgba(255, 149, 0, 0)'];

  return (
    <View style={styles.tileStage}>
      <LinearGradient
        colors={glow}
        start={{ x: 0.5, y: 0.2 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.tile,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
            shadowColor: theme.isDark ? '#000000' : '#0A84FF',
          },
        ]}>
        <AppleIcon name={icon} size={64} color={theme.tint} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tileStage: {
    width: 300,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 150,
    overflow: 'hidden',
  },
  tile: {
    width: 148,
    height: 148,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 8,
  },
  earthStage: {
    width: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earthGlow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    overflow: 'hidden',
  },
  locationPin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: Spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowColor: '#000000',
    elevation: 4,
  },
  pinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pinText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  pinMs: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
  },
});
