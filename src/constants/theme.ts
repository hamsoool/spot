/**
 * Apple iOS Human Interface & Clean Modern VPN Theme
 * Defined for light and dark modes with authentic Apple system tints,
 * grouped table view backgrounds, SF Pro typographies, and border radii.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const AppleColors = {
  // Apple iOS System Palette
  blue: '#007AFF',
  green: '#34C759',
  greenDark: '#28A745',
  orange: '#FF9500',
  purple: '#AF52DE',
  teal: '#30B0C7',
  red: '#FF3B30',
  pink: '#E1306C',

  // Light Mode Colors
  light: {
    background: '#F2F2F7', // iOS Canvas background
    card: '#FFFFFF', // Inset grouped card surface
    cardSecondary: '#F2F2F7',
    text: '#000000',
    textSecondary: '#8E8E93',
    textTertiary: '#AEAEB2',
    separator: 'rgba(60, 60, 67, 0.12)',
    border: 'rgba(60, 60, 67, 0.08)',
    gray5: '#E5E5EA',
    gray6: '#F2F2F7',
    tint: '#007AFF',
    tabBar: 'rgba(242, 242, 247, 0.92)',
    badgeBg: 'rgba(52, 199, 89, 0.12)',
    badgeText: '#34C759',
    blueBadgeBg: 'rgba(0, 122, 255, 0.12)',
    blueBadgeText: '#007AFF',
  },

  // Dark Mode Colors
  dark: {
    background: '#000000',
    card: '#1C1C1E',
    cardSecondary: '#2C2C2E',
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    textTertiary: '#636366',
    separator: 'rgba(84, 84, 88, 0.36)',
    border: 'rgba(255, 255, 255, 0.08)',
    gray5: '#2C2C2E',
    gray6: '#1C1C1E',
    tint: '#0A84FF',
    tabBar: 'rgba(28, 28, 30, 0.92)',
    badgeBg: 'rgba(50, 215, 75, 0.18)',
    badgeText: '#32D74B',
    blueBadgeBg: 'rgba(10, 132, 255, 0.18)',
    blueBadgeText: '#0A84FF',
  },
} as const;

export const Colors = {
  light: {
    text: AppleColors.light.text,
    background: AppleColors.light.background,
    backgroundElement: AppleColors.light.gray5,
    backgroundSelected: AppleColors.light.gray5,
    textSecondary: AppleColors.light.textSecondary,
    card: AppleColors.light.card,
    separator: AppleColors.light.separator,
    tint: AppleColors.light.tint,
  },
  dark: {
    text: AppleColors.dark.text,
    background: AppleColors.dark.background,
    backgroundElement: AppleColors.dark.gray5,
    backgroundSelected: AppleColors.dark.gray5,
    textSecondary: AppleColors.dark.textSecondary,
    card: AppleColors.dark.card,
    separator: AppleColors.dark.separator,
    tint: AppleColors.dark.tint,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, system-ui, sans-serif',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  section: 48,
  // Existing legacy keys preserved for compatibility
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 10,
  lg: 14,
  card: 18,
  pill: 9999,
  full: 9999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 520;

