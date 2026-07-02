import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

import { colors, elevation } from '../theme';

/**
 * Breathing logo orb for the Welcome screen. Three layers:
 *
 *   - Outer ring: very faint, scales 1 → 1.18 over 4.8s (slow exhale).
 *   - Middle ring: smaller scale, opposite phase to outer ring so the two
 *     never feel synchronised.
 *   - Core: the accent-coloured DP block, subtle scale 1 → 1.03.
 *
 * Reanimated drives the whole thing on the UI thread — stays buttery on
 * low-end Android devices.
 */
export function HeroOrb({ size = 112 }: { size?: number }) {
  const outer = useSharedValue(1);
  const middle = useSharedValue(1);
  const core = useSharedValue(1);

  useEffect(() => {
    outer.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    middle.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    core.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [outer, middle, core]);

  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: outer.value }],
    opacity: 0.5 - (outer.value - 1) * 1.6,
  }));
  const middleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: middle.value }],
    opacity: 0.65 - (middle.value - 1) * 2.5,
  }));
  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: core.value }],
  }));

  const ringSize = size * 1.5;
  const middleSize = size * 1.22;

  return (
    <View style={[styles.wrap, { width: ringSize, height: ringSize }]}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: colors.coolSoft,
          },
          outerStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            width: middleSize,
            height: middleSize,
            borderRadius: middleSize / 2,
            borderColor: colors.accentSoft,
          },
          middleStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.core,
          { width: size, height: size, borderRadius: size * 0.28 },
          coreStyle,
        ]}
      >
        <Text style={[styles.coreText, { fontSize: size * 0.34 }]}>DP</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  core: {
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.lg,
    shadowColor: colors.accent,
  },
  coreText: {
    color: colors.primaryText,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});
