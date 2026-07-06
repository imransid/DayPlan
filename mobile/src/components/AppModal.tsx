import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Portal } from './ModalPortal';
import { spacing } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'center' | 'sheet' | 'full';

interface Props {
  visible: boolean;
  onClose: () => void;
  variant?: Variant;
  /** Tap-backdrop / hardware-back dismiss (default true). */
  dismissible?: boolean;
  contentStyle?: ViewStyle;
  children: React.ReactNode;
}

// Snappy but soft — reads as "settled" rather than bouncy.
const OPEN_SPRING = { damping: 20, stiffness: 230, mass: 0.9 } as const;
const CLOSE = { duration: 180 } as const;
// Sheet off-screen travel; larger than any sheet so it fully clears the screen.
const SHEET_TRAVEL = 900;

/**
 * Smooth, portal-rendered modal — replaces React Native's <Modal> (which the
 * app hit off-screen bugs with on some Android OEMs). All animation runs on the
 * UI thread via reanimated:
 *   - center → fade + gentle scale-in
 *   - sheet  → spring slide-up from the bottom, safe-area padded
 *   - full   → fade (used for the image viewer)
 *
 * The overlay covers the whole window (incl. the tab bar) via the Portal. Tap
 * the backdrop or press hardware-back to dismiss (unless dismissible=false).
 * Mount/unmount is animation-aware: it stays mounted through the close
 * animation, then unmounts — so there's no abrupt disappear.
 */
export function AppModal({
  visible,
  onClose,
  variant = 'center',
  dismissible = true,
  contentStyle,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      progress.value = withSpring(1, OPEN_SPRING);
    } else {
      progress.value = withTiming(0, CLOSE, (finished) => {
        if (finished) runOnJS(setRendered)(false);
      });
    }
    // progress is a stable shared value; only react to `visible`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Hardware back closes the top-most modal while it's open.
  useEffect(() => {
    if (!rendered || !dismissible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [rendered, dismissible, onClose]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const contentAnim = useAnimatedStyle(() => {
    if (variant === 'sheet') {
      return { transform: [{ translateY: (1 - progress.value) * SHEET_TRAVEL }] };
    }
    if (variant === 'full') {
      return { opacity: progress.value };
    }
    return {
      opacity: progress.value,
      transform: [{ scale: 0.94 + progress.value * 0.06 }],
    };
  });

  if (!rendered) return null;

  const isSheet = variant === 'sheet';
  const isFull = variant === 'full';

  const onBackdrop = dismissible ? onClose : undefined;

  return (
    <Portal>
      <View style={StyleSheet.absoluteFill}>
        <AnimatedPressable
          style={[styles.backdrop, isFull && styles.backdropFull, backdropStyle]}
          onPress={onBackdrop}
        />
        <KeyboardAvoidingView
          style={[styles.host, isSheet ? styles.hostSheet : styles.hostCenter]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              isFull ? styles.full : isSheet ? styles.sheet : styles.center,
              contentAnim,
              contentStyle,
              // Safe-area bottom padding LAST so it always wins over a card's
              // own `padding`, keeping content above the home indicator.
              isSheet && { paddingBottom: insets.bottom + spacing.lg },
            ]}
          >
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 6, 18, 0.55)',
  },
  backdropFull: { backgroundColor: 'rgba(8, 6, 18, 0.94)' },
  host: { ...StyleSheet.absoluteFillObject },
  hostCenter: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  hostSheet: { justifyContent: 'flex-end' },
  center: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  sheet: { width: '100%' },
  full: { flex: 1, width: '100%' },
});
