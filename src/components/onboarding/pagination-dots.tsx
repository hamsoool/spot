import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

const DOT_SIZE = 7;
const ACTIVE_WIDTH = 22;

interface PaginationDotsProps {
  count: number;
  index: number;
  activeColor: string;
  inactiveColor: string;
}

export function PaginationDots({ count, index, activeColor, inactiveColor }: PaginationDotsProps) {
  return (
    <View
      style={styles.row}
      accessibilityRole="adjustable"
      accessibilityLabel={`Onboarding page ${index + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <Dot
          key={i}
          active={i === index}
          activeColor={activeColor}
          inactiveColor={inactiveColor}
        />
      ))}
    </View>
  );
}

function Dot({
  active,
  activeColor,
  inactiveColor,
}: {
  active: boolean;
  activeColor: string;
  inactiveColor: string;
}) {
  const style = useAnimatedStyle(
    () => ({
      width: withTiming(active ? ACTIVE_WIDTH : DOT_SIZE, { duration: 220 }),
      backgroundColor: withTiming(active ? activeColor : inactiveColor, { duration: 220 }),
    }),
    [active, activeColor, inactiveColor],
  );
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 12,
  },
  dot: {
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
