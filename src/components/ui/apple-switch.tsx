import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, ViewStyle } from 'react-native';

export interface AppleSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: ViewStyle;
}

const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const KNOB_SIZE = 27;
const TRAVEL = TRACK_WIDTH - KNOB_SIZE - 4;

/**
 * iOS-native styled switch (51x31 with 27pt knob) rendered with pure
 * React Native primitives so it works identically on iOS, Android, and web.
 */
export function AppleSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  style,
}: AppleSwitchProps) {
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [progress, value]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRAVEL],
  });

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E9E9EA', '#34C759'],
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[styles.pressable, disabled && styles.disabled, style]}>
      <Animated.View style={[styles.track, { backgroundColor }]}>
        <Animated.View style={[styles.knob, { transform: [{ translateX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: 2,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
});
