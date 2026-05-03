import React, { useEffect } from 'react';
import { Dimensions, ImageBackground, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import liquidGlassBg from '../assets/images/liquid-glass-bg.jpg';

const { width: VW, height: VH } = Dimensions.get('window');

/**
 * Background: abstract fluid art (Unsplash — Milad Fakurian).
 * Replace `src/assets/images/liquid-glass-bg.jpg` anytime to re-theme the app.
 */

function AnimatedBlob({
  shift,
  size,
  left,
  top,
  color,
  phase,
}: {
  shift: number;
  size: number;
  left: number;
  top: number;
  color: string;
  phase: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = phase.value * Math.PI * 2 + shift;
    const dx = Math.sin(p * 0.9) * (VW * 0.1);
    const dy = Math.cos(p * 0.75) * (VH * 0.08);
    const scale = 1 + Math.sin(p * 1.1) * 0.06;
    return {
      transform: [{ translateX: dx }, { translateY: dy }, { scale }],
      opacity: 0.14 + Math.sin(p * 0.5) * 0.08,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          left,
          top,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/**
 * Full-viewport liquid glass: photographic background + subtle motion + native blur + veil.
 */
export function LiquidGlassBackground() {
  const phase = useSharedValue(0);

  useEffect(() => {
    phase.value = withRepeat(
      withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [phase]);

  return (
    <View style={styles.root} pointerEvents="none">
      <ImageBackground
        source={liquidGlassBg}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      >
        <View style={styles.imageTint} pointerEvents="none" />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <AnimatedBlob
            phase={phase}
            shift={0}
            size={VW * 0.9}
            left={-VW * 0.2}
            top={VH * 0.02}
            color="rgba(255, 248, 252, 0.35)"
          />
          <AnimatedBlob
            phase={phase}
            shift={1.9}
            size={VW * 0.75}
            left={VW * 0.3}
            top={-VH * 0.06}
            color="rgba(200, 220, 255, 0.3)"
          />
          <AnimatedBlob
            phase={phase}
            shift={1.1}
            size={VW * 0.6}
            left={VW * 0.05}
            top={VH * 0.48}
            color="rgba(255, 230, 240, 0.28)"
          />
        </View>
      </ImageBackground>

      <BlurView
        style={StyleSheet.absoluteFill}
        blurType={Platform.OS === 'ios' ? 'thinMaterialLight' : 'light'}
        blurAmount={Platform.OS === 'ios' ? 52 : 26}
        reducedTransparencyFallbackColor="#e8e4dc"
        {...(Platform.OS === 'android'
          ? { overlayColor: 'rgba(255, 252, 248, 0.18)', blurRadius: 22 }
          : {})}
      />

      <View style={styles.veil} pointerEvents="none" />
      <View style={styles.vignette} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
    backgroundColor: '#c8c2b8',
  },
  imageTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 252, 248, 0.08)',
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 253, 250, 0.22)',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(40, 36, 52, 0.06)',
  },
});
