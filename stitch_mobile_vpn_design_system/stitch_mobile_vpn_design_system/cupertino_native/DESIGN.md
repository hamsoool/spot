---
name: Cupertino Native
colors:
  surface: '#faf9fe'
  surface-dim: '#dad9df'
  surface-bright: '#faf9fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f8'
  surface-container: '#eeedf3'
  surface-container-high: '#e9e7ed'
  surface-container-highest: '#e3e2e7'
  on-surface: '#1a1b1f'
  on-surface-variant: '#414755'
  inverse-surface: '#2f3034'
  inverse-on-surface: '#f1f0f5'
  outline: '#717786'
  outline-variant: '#c1c6d7'
  surface-tint: '#005bc1'
  primary: '#0058bc'
  on-primary: '#ffffff'
  primary-container: '#0070eb'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#006e28'
  on-secondary: '#ffffff'
  secondary-container: '#6ffb85'
  on-secondary-container: '#00732a'
  tertiary: '#9e3d00'
  on-tertiary: '#ffffff'
  tertiary-container: '#c64f00'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#72fe88'
  secondary-fixed-dim: '#53e16f'
  on-secondary-fixed: '#002107'
  on-secondary-fixed-variant: '#00531c'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb595'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7c2e00'
  background: '#faf9fe'
  on-background: '#1a1b1f'
  surface-variant: '#e3e2e7'
  canvas-background: '#F2F2F7'
  surface-card: '#FFFFFF'
  system-blue: '#007AFF'
  system-green: '#34C759'
  system-orange: '#FF9500'
  system-gray-5: '#E5E5EA'
  system-gray-6: '#F2F2F7'
  text-primary: '#1C1C1E'
  text-secondary: '#8E8E93'
  system-separator: rgba(60, 60, 67, 0.12)
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 34px
    fontWeight: '700'
    lineHeight: 41px
    letterSpacing: -0.4px
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.3px
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.2px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 25px
    letterSpacing: -0.15px
  title-md:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.1px
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.1px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.05px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0px
  caption-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 13px
    letterSpacing: 0.05px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Overview
Apple's iOS design language is crisp, clean, refined, and authentic to native iOS / SF Pro standards. Pristine white cards on an off-white/light-gray canvas, native iOS system colors (authentic Apple System Blue `#007AFF`, system emerald `#34C759`, neutral system gray fills `#F2F2F7`, and iOS grouped table view aesthetics), crisp SF-style typography, subtle 0.5px hair-thin borders, and smooth native iOS switch toggles and pill buttons.

## Colors
- **Canvas / Background**: `#F2F2F7` (iOS System Grouped Background)
- **Surface / Card Fill**: `#FFFFFF` (iOS Secondary Grouped Background / Pure White)
- **Primary / Accent**: `#007AFF` (Apple System Blue)
- **Success / Active Protection**: `#34C759` (iOS System Green)
- **Warning / Orange**: `#FF9500` (iOS System Orange)
- **Text Primary (Ink)**: `#000000` (iOS Label Color / Pure Near-Black `#1C1C1E`)
- **Text Secondary (Muted)**: `#8E8E93` (iOS Secondary Label)
- **Separator / Hairline**: `rgba(60, 60, 67, 0.12)` (iOS System Separator)
- **Control Fill / Button Secondary**: `#E5E5EA` / `#F2F2F7` (iOS System Gray 5 & 6)

## Typography
- Display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif
- Body: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif
- Clean typographic scale with negative letter-spacing on display sizes and authentic iOS line-heights.

## Shapes & Radii
- Cards: 16px to 20px (iOS continuous rounded corners)
- Buttons & Pills: 9999px (iOS Capsule / Pill) or 10px to 12px for standard utility controls
- Switches: authentic iOS pill toggle (51px x 31px, white circle thumb, vibrant green `#34C759` when on)

## Elevation
- Whisper-soft, subtle iOS drop shadows (`0 2px 10px rgba(0, 0, 0, 0.04)`) or crisp hairline borders (`1px solid rgba(0, 0, 0, 0.06)`).
