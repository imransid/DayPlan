import React, { useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withSequence,
  interpolateColor,
} from 'react-native-reanimated';

import { CheckIcon } from './Icon';
import { colors, motion, radius, elevation } from '../theme';
import type { Task } from '../types';

interface Props {
  task: Task;
  /** Receives the task id so the parent can pass a single stable handler
   *  (keeps this row memoizable — no new closure per render). */
  onToggle: (id: string) => void;
  onLongPress?: (id: string) => void;
}

/**
 * Task row with three motion details:
 *
 *   1. Press feedback — whole row scales + surface lightens on press.
 *   2. Check toggle — circle squish-pop, check fades + scales in, row tints
 *      toward a soft accent wash, title fades to muted, strikethrough draws
 *      across the title (animated width 0 → 100%).
 *   3. The strike is a real animated View (not textDecorationLine) so the
 *      line "draws" through the title rather than popping on/off.
 */
function AnimatedTaskRowBase({ task, onToggle, onLongPress }: Props) {
  const isDone = !!task.doneAt;

  const done = useSharedValue(isDone ? 1 : 0);
  const press = useSharedValue(0);
  const pop = useSharedValue(1);

  useEffect(() => {
    done.value = withSpring(isDone ? 1 : 0, motion.springSoft);
  }, [isDone, done]);

  const handlePress = () => {
    pop.value = withSequence(
      withTiming(0.72, { duration: 110, easing: motion.easeOut }),
      withSpring(1, motion.springBounce),
    );
    onToggle(task.id);
  };

  // Whole-row container: press scale + colour wash toward soft accent
  const rowStyle = useAnimatedStyle(() => {
    const scale = 1 - press.value * 0.02;
    return {
      transform: [{ scale }],
      backgroundColor: interpolateColor(
        done.value,
        [0, 1],
        [colors.surface, 'rgba(199, 210, 254, 0.45)'], // accentSoft @ 45%
      ),
      borderColor: interpolateColor(
        done.value,
        [0, 1],
        [colors.border, 'rgba(99, 102, 241, 0.35)'],
      ),
    };
  });

  // Circle: outline + fill interpolate based on done. Pop scale on toggle.
  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
    backgroundColor: interpolateColor(
      done.value,
      [0, 1],
      ['rgba(0,0,0,0)', colors.accent],
    ),
    borderColor: interpolateColor(
      done.value,
      [0, 1],
      [colors.textDisabled, colors.accent],
    ),
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: done.value,
    transform: [{ scale: 0.6 + done.value * 0.4 }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      done.value,
      [0, 1],
      [colors.textPrimary, colors.textMuted],
    ),
  }));

  const strikeStyle = useAnimatedStyle(() => ({
    width: `${done.value * 100}%`,
    opacity: done.value,
  }));

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress ? () => onLongPress(task.id) : undefined}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 80 });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 160 });
      }}
    >
      <Animated.View style={[styles.row, rowStyle]}>
        <Animated.View style={[styles.circle, circleStyle]}>
          <Animated.View style={checkStyle}>
            <CheckIcon size={14} color="#fff" weight={2.6} />
          </Animated.View>
        </Animated.View>

        <View style={styles.titleWrap}>
          <Animated.Text style={[styles.title, titleStyle]} numberOfLines={2}>
            {task.title}
          </Animated.Text>
          <Animated.View style={[styles.strike, strikeStyle]} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Memoized so toggling/deleting one task doesn't re-run the five
 * useAnimatedStyle worklets for every other row. Effective because the parent
 * now passes stable id-based handlers and RTK Query returns the same task
 * object reference for unchanged rows.
 */
export const AnimatedTaskRow = React.memo(AnimatedTaskRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    marginBottom: 10,
    borderWidth: 1,
    ...elevation.sm,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1, position: 'relative' },
  title: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 20,
    fontWeight: '500',
  },
  strike: {
    position: 'absolute',
    left: 0,
    top: 9,
    height: 1.4,
    backgroundColor: colors.textMuted,
    borderRadius: 1,
  },
});
