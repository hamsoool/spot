import React, { useEffect, useState } from "react";
import { Text, StyleSheet, Platform } from "react-native";
import earthFrames from "@/constants/ascii-earth-frames.json";

interface AsciiEarthProps {
  color: string;
  isRotating?: boolean;
  fontSize?: number;
}

export function AsciiEarth({
  color,
  isRotating = true,
  fontSize = 12,
}: AsciiEarthProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!isRotating) return;

    // 36 frames at ~100ms per frame = 3.6s per complete revolution
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % earthFrames.length);
    }, 100);

    return () => clearInterval(interval);
  }, [isRotating]);

  return (
    <Text
      style={[
        styles.ascii,
        {
          color,
          fontSize,
          lineHeight: Math.round(fontSize * 1.15),
        },
      ]}
    >
      {earthFrames[frameIndex]}
    </Text>
  );
}

const styles = StyleSheet.create({
  ascii: {
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    textAlign: "center",
    fontWeight: "600",
    letterSpacing: 2.2,
  },
});
