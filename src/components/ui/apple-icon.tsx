import { ViewStyle } from 'react-native';
import { useAppleTheme } from '@/hooks/use-theme';
import { renderAppleIconPrimary } from './apple-icon-primary';
import { renderAppleIconSecondary } from './apple-icon-secondary';

export type IconName =
  | 'shield'
  | 'shield-check'
  | 'leaf'
  | 'person'
  | 'checkmark'
  | 'search'
  | 'close'
  | 'chevron-right'
  | 'arrow-right'
  | 'bolt'
  | 'globe'
  | 'settings'
  | 'wifi-lock'
  | 'pause'
  | 'block'
  | 'tv'
  | 'image'
  | 'book'
  | 'chat'
  | 'info'
  | 'calendar'
  | 'play'
  | 'camera'
  | 'music';

export interface AppleIconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export function AppleIcon({ name, size = 20, color, style }: AppleIconProps) {
  const theme = useAppleTheme();
  const c = color ?? theme.text;
  const stroke = Math.max(1.5, Math.round(size / 11));

  const centerStyle: ViewStyle = {
    width: size,
    height: size,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  const primary = renderAppleIconPrimary(name, c, stroke, size, centerStyle, style);
  if (primary) return primary;

  return renderAppleIconSecondary(name, c, stroke, size, centerStyle, style);
}
