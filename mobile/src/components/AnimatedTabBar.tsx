import React, { useEffect } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { CheckIcon, CalendarIcon, SettingsIcon, NoteIcon } from './Icon';
import { colors, motion, radius, spacing } from '../theme';

const TAB_HEIGHT = 64;
const INDICATOR_HEIGHT = 44;
const HORIZONTAL_PADDING = spacing.md;

/**
 * Custom bottom tab bar — glass surface with a sliding accent pill.
 *
 *   - Glass background that lets the colourful page bg show through.
 *   - Indicator pill animates horizontally between tabs with spring physics.
 *   - Active tab: icon + label fade to full colour and lift slightly.
 *   - Press feedback: tab icon springs to 0.92 then back.
 */
export function AnimatedTabBar({ state, navigation }: BottomTabBarProps) {
  const { width: screenWidth } = useWindowDimensions();
  const innerWidth = screenWidth - HORIZONTAL_PADDING * 2;
  const tabCount = state.routes.length;
  const tabWidth = innerWidth / tabCount;
  const indicatorWidth = Math.min(tabWidth - 12, 110);

  const activeIndex = useSharedValue(state.index);

  useEffect(() => {
    activeIndex.value = withSpring(state.index, motion.springSoft);
  }, [state.index, activeIndex]);

  const indicatorStyle = useAnimatedStyle(() => {
    const tx = activeIndex.value * tabWidth + (tabWidth - indicatorWidth) / 2;
    return { transform: [{ translateX: tx }] };
  });

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <View style={styles.bar}>
        {/* Sliding accent pill — sits behind the tab buttons */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: indicatorWidth,
              height: INDICATOR_HEIGHT,
              top: (TAB_HEIGHT - INDICATOR_HEIGHT) / 2,
              left: HORIZONTAL_PADDING,
            },
            indicatorStyle,
          ]}
        />

        <View style={styles.tabsRow}>
          {state.routes.map((route, idx) => {
            const isActive = state.index === idx;
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isActive && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TabItem
                key={route.key}
                routeName={route.name}
                isActive={isActive}
                onPress={onPress}
                width={tabWidth}
              />
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

interface TabItemProps {
  routeName: string;
  isActive: boolean;
  onPress: () => void;
  width: number;
}

function TabItem({ routeName, isActive, onPress, width }: TabItemProps) {
  const active = useSharedValue(isActive ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    active.value = withTiming(isActive ? 1 : 0, {
      duration: motion.fast,
      easing: motion.easeOut,
    });
  }, [isActive, active]);

  const iconWrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value * (1 + active.value * 0.08) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      active.value,
      [0, 1],
      [colors.textMuted, colors.accent],
    ),
    transform: [{ translateY: (1 - active.value) * 1 }],
    opacity: 0.7 + active.value * 0.3,
  }));

  const renderIcon = () => {
    const colorVal = isActive ? colors.accent : colors.textMuted;
    if (routeName === 'Today') return <CheckIcon size={22} color={colorVal} weight={1.9} />;
    if (routeName === 'History') return <CalendarIcon size={22} color={colorVal} weight={1.9} />;
    if (routeName === 'Notes') return <NoteIcon size={22} color={colorVal} weight={1.9} />;
    return <SettingsIcon size={22} color={colorVal} weight={1.9} />;
  };

  const label = routeName === 'SettingsTab' ? 'Settings' : routeName;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withSpring(0.92, motion.springSnappy);
      }}
      onPressOut={() => {
        press.value = withSpring(1, motion.springSnappy);
      }}
      style={{
        width,
        height: TAB_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <Animated.View
        style={[
          { alignItems: 'center', justifyContent: 'center', gap: 3 },
          iconWrapStyle,
        ]}
      >
        {renderIcon()}
        <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    // Glass surface — lets the colourful background show through.
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.85)',
  },
  bar: {
    height: TAB_HEIGHT,
    paddingHorizontal: HORIZONTAL_PADDING,
    flexDirection: 'row',
    position: 'relative',
  },
  tabsRow: {
    flexDirection: 'row',
    flex: 1,
  },
  indicator: {
    position: 'absolute',
    backgroundColor: 'rgba(99, 102, 241, 0.12)', // accent indigo at 12%
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.18)',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
