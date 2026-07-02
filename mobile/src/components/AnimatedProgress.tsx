import React, { useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';

import { colors, motion, gradients } from '../theme';

interface Props {
  /** 0..100 */
  value: number;
  /** Track height in px. */
  height?: number;
  /** Hide the wash-color fill? */
  showColorShift?: boolean;
}

/**
 * Animated progress bar.
 *
 *   1. Width — springs from previous to new value, slight overshoot reads
 *      as a small "satisfaction" beat when a task is completed.
 *   2. Fill colour — interpolates warm → violet → success across the 0..100
 *      range so the bar visually rewards higher completion.
 */
export function AnimatedProgressBar({
  value,
  height = 6,
  showColorShift = true,
}: Props) {
  const v = useSharedValue(value);

  useEffect(() => {
    v.value = withSpring(value, motion.springSoft);
  }, [value, v]);

  const widthStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, v.value))}%`,
  }));

  const colorStyle = useAnimatedStyle(() => {
    if (!showColorShift) return { backgroundColor: colors.accent };
    return {
      backgroundColor: interpolateColor(
        v.value,
        [0, 50, 100],
        [gradients.progress.low, gradients.progress.mid, gradients.progress.high],
      ),
    };
  });

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={[
          styles.fill,
          { height, borderRadius: height / 2 },
          widthStyle,
          colorStyle,
        ]}
      />
    </View>
  );
}

/**
 * Counter that smoothly animates between integer values. Implemented with
 * a JS-side rAF loop so a Text node can render the integer cleanly.
 */
export function AnimatedNumber({
  value,
  style,
  suffix = '',
}: {
  value: number;
  style?: any;
  suffix?: string;
}) {
  const [display, setDisplay] = React.useState(value);

  useEffect(() => {
    let raf = 0;
    const start = display;
    const end = value;
    const t0 = Date.now();
    const dur = motion.base;
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const next = Math.round(start + (end - start) * eased);
      if (next !== display) setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Text style={style}>
      {display}
      {suffix}
    </Text>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  fill: {
    minWidth: 4,
  },
});
