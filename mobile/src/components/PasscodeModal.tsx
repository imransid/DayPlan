import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { colors, spacing, radius, fontSize, elevation } from '../theme';

type Mode = 'set' | 'enter';

interface Props {
  visible: boolean;
  mode: Mode;
  /** Optional heading override. */
  title?: string;
  subtitle?: string;
  onClose: () => void;
  /**
   * Called with the entered passcode.
   *  - mode="enter": return true if accepted (verified), false to show
   *    "incorrect" and keep the modal open.
   *  - mode="set": called once the two entries match; return value ignored.
   */
  onSubmit: (passcode: string) => boolean;
}

const MIN_LEN = 4;

/**
 * Passcode prompt for the note-lock feature. Two modes:
 *   - "set"   → create the app passcode (enter twice to confirm).
 *   - "enter" → unlock (single entry, verified by the caller).
 *
 * Uses a secure text field rather than a bespoke keypad so any passcode (not
 * just digits) works and there are no extra native surfaces to crash under the
 * New Architecture.
 */
export function PasscodeModal({
  visible,
  mode,
  title,
  subtitle,
  onClose,
  onSubmit,
}: Props) {
  const [entry, setEntry] = useState('');
  const [confirm, setConfirm] = useState('');
  const [stage, setStage] = useState<'first' | 'confirm'>('first');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Reset all local state each time the modal opens.
  useEffect(() => {
    if (visible) {
      setEntry('');
      setConfirm('');
      setStage('first');
      setError(null);
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const isConfirmStage = mode === 'set' && stage === 'confirm';
  const currentValue = isConfirmStage ? confirm : entry;
  const setCurrentValue = isConfirmStage ? setConfirm : setEntry;

  const heading =
    title ??
    (mode === 'set'
      ? isConfirmStage
        ? 'Confirm passcode'
        : 'Set a passcode'
      : 'Enter passcode');

  const sub =
    subtitle ??
    (mode === 'set'
      ? isConfirmStage
        ? 'Re-enter it to confirm.'
        : 'Used to lock and open your private notes.'
      : 'This note is locked.');

  const handleSubmit = () => {
    if (mode === 'set') {
      if (stage === 'first') {
        if (entry.length < MIN_LEN) {
          setError(`Use at least ${MIN_LEN} characters`);
          return;
        }
        setStage('confirm');
        setError(null);
        inputRef.current?.focus();
        return;
      }
      if (confirm !== entry) {
        setError('Passcodes don’t match');
        setConfirm('');
        return;
      }
      onSubmit(entry);
      return;
    }

    // enter mode
    if (entry.length === 0) return;
    const ok = onSubmit(entry);
    if (!ok) {
      setError('Incorrect passcode');
      setEntry('');
    }
  };

  const canSubmit = currentValue.length >= (mode === 'enter' ? 1 : MIN_LEN);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.lockGlyph}>🔒</Text>
          <Text style={styles.title}>{heading}</Text>
          <Text style={styles.sub}>{sub}</Text>

          <TextInput
            ref={inputRef}
            value={currentValue}
            onChangeText={(t) => {
              setCurrentValue(t);
              if (error) setError(null);
            }}
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="Passcode"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'default'}
            returnKeyType={isConfirmStage || mode === 'enter' ? 'done' : 'next'}
            onSubmitEditing={handleSubmit}
            maxLength={32}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={[styles.btn, styles.btnGhost]}
              accessibilityRole="button"
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[styles.btn, styles.btnPrimary, !canSubmit && styles.btnDisabled]}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>
                {mode === 'set' && stage === 'first' ? 'Continue' : 'Done'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 6, 18, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...elevation.md,
  },
  lockGlyph: { fontSize: 34, marginBottom: spacing.sm },
  title: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  sub: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  input: {
    width: '100%',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  inputError: { borderColor: colors.danger },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.small,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    width: '100%',
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  btnGhostText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
});
