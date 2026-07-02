import React, { useEffect } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';

import { PlusIcon } from './Icon';
import { colors, motion, elevation } from '../theme';

interface Props {
  onPress: () => void;
  /** When true, the icon morphs from + to ×. */
  isOpen?: boolean;
  /** When true, FAB gently pulses to draw the eye (e.g. empty list). */
  pulse?: boolean;
}

/**
 * The FAB carries three motions:
 *   1. Press squish — scales 1 → 0.9 and back via spring.
 *   2. Pulse — 1 → 1.06 → 1 loop when `pulse` is true; halo fades in.
 *   3. Morph — when `isOpen`, icon rotates 45° so + reads as ×.
 *
 * Visually now uses the modern accent indigo with a vivid glow halo — the
 * old dark FAB blended too much into deep-text content; this one stands
 * proud as a clear primary action.
 */
export function AnimatedFab({ onPress, isOpen, pulse }: Props) {
  const press = useSharedValue(1);
  const pulseAmount = useSharedValue(1);
  const open = useSharedValue(0);

  useEffect(() => {
    if (pulse) {
      pulseAmount.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 900, easing: motion.easeInOut }),
          withTiming(1.0, { duration: 900, easing: motion.easeInOut }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulseAmount);
      pulseAmount.value = withTiming(1, { duration: motion.fast });
    }
  }, [pulse, pulseAmount]);

  useEffect(() => {
    open.value = withSpring(isOpen ? 1 : 0, motion.springSnappy);
  }, [isOpen, open]);

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value * pulseAmount.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${open.value * 45}deg` }],
  }));

  // Halo: a wider ring that fades in only while pulsing.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.0 + (pulseAmount.value - 1) * 7,
    transform: [{ scale: 1 + (pulseAmount.value - 1) * 6 }],
  }));

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />
      <Animated.View style={fabStyle}>
        <Pressable
          onPress={onPress}
          onPressIn={() => {
            press.value = withSpring(0.9, motion.springSnappy);
          }}
          onPressOut={() => {
            press.value = withSpring(1, motion.springSnappy);
          }}
          style={styles.fab}
        >
          {/* Inner highlight ring — adds depth, reads as a polished pill */}
          <View style={styles.innerRing} pointerEvents="none" />
          <Animated.View style={iconStyle}>
            <PlusIcon size={26} color={colors.primaryText} weight={2.6} />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...elevation.lg,
    shadowColor: colors.accent, // colored shadow for an indigo glow
  },
  innerRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  halo: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
  },
});
