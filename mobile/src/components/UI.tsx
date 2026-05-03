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
import { colors, radius, spacing, fontSize } from '../theme';

// ─── Button ──────────────────────────────────────────────
interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
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
    <Pressable
      {...rest}
      style={({ pressed }) => [
        styles.base,
        fullWidth && { width: '100%' },
        pressed && { opacity: 0.85 },
        style as any,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={styles.text.color} size="small" />
      ) : (
        <Text style={styles.text}>{label}</Text>
      )}
    </Pressable>
  );
}

function buttonStyles(variant: ButtonProps['variant']) {
  const map = {
    primary: { bg: colors.primary, fg: colors.primaryText, border: 'transparent' },
    secondary: { bg: colors.surfaceAlt, fg: colors.textPrimary, border: 'transparent' },
    outline: { bg: 'transparent', fg: colors.textSecondary, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.textSecondary, border: 'transparent' },
  } as const;
  const v = map[variant ?? 'primary'];
  return StyleSheet.create({
    base: {
      backgroundColor: v.bg,
      borderColor: v.border,
      borderWidth: variant === 'outline' ? 0.5 : 0,
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: { color: v.fg, fontSize: 14, fontWeight: '500' },
  });
}

// ─── Input ───────────────────────────────────────────────
interface InputProps extends TextInputProps {
  label?: string;
  errorText?: string;
}

export function Input({ label, errorText, style, ...rest }: InputProps) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={inputStyles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...rest}
        style={[inputStyles.input, errorText ? inputStyles.error : null, style]}
      />
      {errorText && <Text style={inputStyles.errorText}>{errorText}</Text>}
    </View>
  );
}

const inputStyles = StyleSheet.create({
  label: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 6,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  error: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 4 },
});

// ─── Card ────────────────────────────────────────────────
export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 0.5,
          borderColor: colors.border,
          padding: spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Screen wrapper ──────────────────────────────────────
export function Screen({ children, style, ...rest }: ViewProps) {
  return (
    <View
      {...rest}
      style={[{ flex: 1, backgroundColor: colors.screen, paddingHorizontal: spacing.lg }, style]}
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
          fontWeight: '500',
          color: colors.textPrimary,
          letterSpacing: -0.3,
        }}
      >
        {children}
      </Text>
      {subtitle && (
        <Text style={{ fontSize: fontSize.small, color: colors.textMuted, marginTop: 2 }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}
