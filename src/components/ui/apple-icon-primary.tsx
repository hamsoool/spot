import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import type { IconName } from './apple-icon';

export function renderAppleIconPrimary(
  name: IconName,
  c: string,
  stroke: number,
  size: number,
  centerStyle: ViewStyle,
  style?: ViewStyle
): React.ReactNode {
  switch (name) {
    case 'shield':
    case 'shield-check':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.76,
              height: size * 0.88,
              borderWidth: stroke,
              borderColor: c,
              borderTopLeftRadius: size * 0.38,
              borderTopRightRadius: size * 0.38,
              borderBottomLeftRadius: size * 0.45,
              borderBottomRightRadius: size * 0.45,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {name === 'shield-check' && (
              <View
                style={{
                  width: size * 0.3,
                  height: size * 0.16,
                  borderColor: c,
                  borderBottomWidth: stroke + 0.3,
                  borderLeftWidth: stroke + 0.3,
                  transform: [{ rotate: '-45deg' }, { translateY: -1 }],
                }}
              />
            )}
          </View>
        </View>
      );

    case 'leaf':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.72,
              height: size * 0.72,
              backgroundColor: c,
              borderTopLeftRadius: size * 0.72,
              borderBottomRightRadius: size * 0.72,
              borderTopRightRadius: 2,
              borderBottomLeftRadius: 2,
              transform: [{ rotate: '-18deg' }],
            }}
          />
        </View>
      );

    case 'person':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.38,
              height: size * 0.38,
              borderRadius: size * 0.19,
              backgroundColor: c,
              marginBottom: 1,
            }}
          />
          <View
            style={{
              width: size * 0.72,
              height: size * 0.36,
              borderTopLeftRadius: size * 0.36,
              borderTopRightRadius: size * 0.36,
              backgroundColor: c,
            }}
          />
        </View>
      );

    case 'checkmark':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.52,
              height: size * 0.3,
              borderColor: c,
              borderBottomWidth: stroke + 0.5,
              borderLeftWidth: stroke + 0.5,
              transform: [{ rotate: '-45deg' }, { translateY: -1 }],
            }}
          />
        </View>
      );

    case 'search':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.55,
              height: size * 0.55,
              borderRadius: size * 0.28,
              borderWidth: stroke,
              borderColor: c,
              transform: [{ translateX: -size * 0.08 }, { translateY: -size * 0.08 }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: stroke,
              height: size * 0.32,
              backgroundColor: c,
              right: size * 0.2,
              bottom: size * 0.18,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );

    case 'close':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.75,
              height: size * 0.75,
              borderRadius: size * 0.38,
              backgroundColor: c,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: size * 0.52,
                fontWeight: '700',
                lineHeight: size * 0.65,
                marginTop: -1,
              }}>
              ×
            </Text>
          </View>
        </View>
      );

    case 'chevron-right':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.34,
              height: size * 0.34,
              borderTopWidth: stroke,
              borderRightWidth: stroke,
              borderColor: c,
              transform: [{ rotate: '45deg' }, { translateX: -1 }],
            }}
          />
        </View>
      );

    case 'arrow-right':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.55,
              height: stroke,
              backgroundColor: c,
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: size * 0.22,
              width: size * 0.32,
              height: size * 0.32,
              borderTopWidth: stroke,
              borderRightWidth: stroke,
              borderColor: c,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'bolt':
      return (
        <View style={[centerStyle, style]}>
          <Text
            style={{
              color: c,
              fontSize: size * 0.88,
              fontWeight: '900',
              lineHeight: size,
              textAlign: 'center',
            }}>
            ⚡
          </Text>
        </View>
      );

    case 'globe':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.82,
              height: size * 0.82,
              borderRadius: size * 0.41,
              borderWidth: stroke,
              borderColor: c,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <View
              style={{
                width: size * 0.4,
                height: size * 0.82,
                borderRadius: size * 0.41,
                borderWidth: stroke * 0.8,
                borderColor: c,
              }}
            />
            <View
              style={{
                position: 'absolute',
                width: size * 0.82,
                height: stroke * 0.8,
                backgroundColor: c,
              }}
            />
          </View>
        </View>
      );

    default:
      return null;
  }
}
