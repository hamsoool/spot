import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import type { IconName } from './apple-icon';

export function renderAppleIconSecondary(
  name: IconName,
  c: string,
  stroke: number,
  size: number,
  centerStyle: ViewStyle,
  style?: ViewStyle
): React.ReactNode {
  switch (name) {
    case 'settings':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.8,
              borderRadius: size * 0.4,
              borderWidth: stroke,
              borderColor: c,
              borderStyle: 'dashed',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <View
              style={{
                width: size * 0.28,
                height: size * 0.28,
                borderRadius: size * 0.14,
                backgroundColor: c,
              }}
            />
          </View>
        </View>
      );

    case 'wifi-lock':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.78,
              height: size * 0.78,
              borderTopWidth: stroke,
              borderRightWidth: stroke,
              borderColor: c,
              borderTopRightRadius: size * 0.78,
              transform: [{ rotate: '-45deg' }, { translateY: size * 0.15 }],
            }}
          />
        </View>
      );

    case 'pause':
      return (
        <View style={[centerStyle, { flexDirection: 'row', gap: 3 }, style]}>
          <View style={{ width: stroke * 1.2, height: size * 0.45, backgroundColor: c, borderRadius: 1 }} />
          <View style={{ width: stroke * 1.2, height: size * 0.45, backgroundColor: c, borderRadius: 1 }} />
        </View>
      );

    case 'block':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.8,
              borderRadius: size * 0.4,
              borderWidth: stroke,
              borderColor: c,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <View
              style={{
                width: size * 0.8,
                height: stroke,
                backgroundColor: c,
                transform: [{ rotate: '-45deg' }],
              }}
            />
          </View>
        </View>
      );

    case 'tv':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.82,
              height: size * 0.6,
              borderRadius: 3,
              borderWidth: stroke,
              borderColor: c,
            }}
          />
        </View>
      );

    case 'image':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.82,
              height: size * 0.7,
              borderRadius: 3,
              borderWidth: stroke,
              borderColor: c,
              padding: 2,
            }}>
            <View
              style={{
                width: size * 0.2,
                height: size * 0.2,
                borderRadius: size * 0.1,
                backgroundColor: c,
              }}
            />
          </View>
        </View>
      );

    default:
      return renderAppleIconTertiary(name, c, stroke, size, centerStyle, style);
  }
}

function renderAppleIconTertiary(
  name: IconName,
  c: string,
  stroke: number,
  size: number,
  centerStyle: ViewStyle,
  style?: ViewStyle
): React.ReactNode {
  switch (name) {
    case 'book':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.74,
              height: size * 0.68,
              borderWidth: stroke,
              borderColor: c,
              borderRadius: 2,
              borderLeftWidth: stroke * 2,
            }}
          />
        </View>
      );

    case 'chat':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.62,
              borderRadius: size * 0.3,
              borderWidth: stroke,
              borderColor: c,
            }}
          />
        </View>
      );

    case 'info':
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
            <Text
              style={{
                color: c,
                fontSize: size * 0.52,
                fontWeight: '700',
                fontStyle: 'italic',
                lineHeight: size * 0.6,
              }}>
              i
            </Text>
          </View>
        </View>
      );

    case 'calendar':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.78,
              height: size * 0.74,
              borderRadius: 3,
              borderWidth: stroke,
              borderColor: c,
            }}>
            <View
              style={{
                width: '100%',
                height: stroke,
                backgroundColor: c,
                marginTop: size * 0.16,
              }}
            />
          </View>
        </View>
      );

    case 'play':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: size * 0.45,
              borderTopWidth: size * 0.28,
              borderBottomWidth: size * 0.28,
              borderStyle: 'solid',
              borderLeftColor: c,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
              marginLeft: 2,
            }}
          />
        </View>
      );

    case 'camera':
      return (
        <View style={[centerStyle, style]}>
          <View
            style={{
              width: size * 0.84,
              height: size * 0.64,
              borderRadius: 3,
              borderWidth: stroke,
              borderColor: c,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <View
              style={{
                width: size * 0.3,
                height: size * 0.3,
                borderRadius: size * 0.15,
                borderWidth: stroke * 0.9,
                borderColor: c,
              }}
            />
          </View>
        </View>
      );

    case 'music':
      return (
        <View style={[centerStyle, style]}>
          <Text
            style={{
              color: c,
              fontSize: size * 0.78,
              fontWeight: '700',
              lineHeight: size,
            }}>
            ♫
          </Text>
        </View>
      );

    default:
      return null;
  }
}

