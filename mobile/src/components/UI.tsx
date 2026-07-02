import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';

import { colors, radius, spacing, fontSize, motion, elevation, glass } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── PressScale ──────────────────────────────────────────
// REQUIRED by SettingsScreen and IntegrationsScreen. Removing this export
// will crash both screens with "Element type is invalid... got: undefined".
interface PressScaleProps extends PressableProps {
  children: React.ReactNode;
  /** Scale factor at fully-pressed. Default 0.96. */
  scaleTo?: number;
}

export function PressScale({
  children,
  scaleTo = 0.96,
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressScaleProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) {
          scale.value = withSpring(scaleTo, motion.springSnappy);
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, motion.springSnappy);
        onPressOut?.(e);
      }}
      style={[animStyle, style as any]}
    >
      {children}
    </AnimatedPressable>
  );
}

// ─── Button ──────────────────────────────────────────────
interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'accent';
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  loading,
  fullWidth = true,
  style,
  ...rest
}: ButtonProps) {
  const styles = buttonStyles(variant);
  return (
    <PressScale
      {...rest}
      style={[styles.base, fullWidth && { width: '100%' }, style as any]}
    >
      {loading ? (
        <ActivityIndicator color={styles.text.color as string} size="small" />
      ) : (
        <Text style={styles.text}>{label}</Text>
      )}
    </PressScale>
  );
}

function buttonStyles(variant: ButtonProps['variant']) {
  const map = {
    primary: { bg: colors.primary, fg: colors.primaryText, border: 'transparent', shadow: true },
    secondary: { bg: colors.surface, fg: colors.textPrimary, border: colors.border, shadow: false },
    outline: { bg: 'transparent', fg: colors.textPrimary, border: colors.borderStrong, shadow: false },
    ghost: { bg: 'transparent', fg: colors.textSecondary, border: 'transparent', shadow: false },
    accent: { bg: colors.accent, fg: '#fff', border: 'transparent', shadow: true },
  } as const;
  const v = map[variant ?? 'primary'];
  return StyleSheet.create({
    base: {
      backgroundColor: v.bg,
      borderColor: v.border,
      borderWidth: variant === 'outline' || variant === 'secondary' ? 1 : 0,
      paddingVertical: 15,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      ...(v.shadow ? elevation.md : {}),
    },
    text: {
      color: v.fg,
      fontSize: 15,
      fontWeight: '600' as const,
      letterSpacing: 0.1,
    },
  });
}

// ─── Input with animated focus state ──────────────────────
interface InputProps extends TextInputProps {
  label?: string;
  errorText?: string;
}

export function Input({
  label,
  errorText,
  style,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const focus = useSharedValue(0);
  const border = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      [colors.border, colors.accent],
    ),
  }));

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={inputStyles.label}>{label}</Text>}
      <Animated.View
        style={[inputStyles.input, errorText ? inputStyles.error : null, border]}
      >
        <TextInput
          placeholderTextColor={colors.textMuted}
          {...rest}
          onFocus={(e) => {
            focus.value = withTiming(1, { duration: motion.fast });
            onFocus?.(e);
          }}
          onBlur={(e) => {
            focus.value = withTiming(0, { duration: motion.fast });
            onBlur?.(e);
          }}
          style={[inputStyles.text, style]}
        />
      </Animated.View>
      {errorText && <Text style={inputStyles.errorText}>{errorText}</Text>}
    </View>
  );
}

const inputStyles = StyleSheet.create({
  label: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 6,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 2,
    ...elevation.sm,
  },
  text: {
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 12,
  },
  error: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 4 },
});

// ─── Card ────────────────────────────────────────────────
export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View {...rest} style={[glass.card, { padding: spacing.lg }, style]}>
      {children}
    </View>
  );
}

// ─── Screen wrapper ──────────────────────────────────────
export function Screen({ children, style, ...rest }: ViewProps) {
  return (
    <View
      {...rest}
      style={[
        { flex: 1, backgroundColor: colors.screen, paddingHorizontal: spacing.lg },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Heading ─────────────────────────────────────────────
export function Heading({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text
        style={{
          fontSize: fontSize.heading,
          fontWeight: '700',
          color: colors.textPrimary,
          letterSpacing: -0.7,
        }}
      >
        {children}
      </Text>
      {subtitle && (
        <Text
          style={{
            fontSize: fontSize.small,
            color: colors.textMuted,
            marginTop: 4,
            fontWeight: '500',
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}
