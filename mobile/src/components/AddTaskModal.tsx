import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './UI';
import { colors, spacing, radius, elevation } from '../theme';

interface Props {
  visible: boolean;
  /** True while the parent's create-task mutation is in flight. */
  loading?: boolean;
  onClose: () => void;
  /** Receives the trimmed, non-empty title. Parent decides when to close. */
  onSubmit: (title: string) => void;
}

/**
 * Bottom-sheet modal for adding a new task.
 *
 * ─── Why this is its own component ──────────────────────────────────────
 * The previous version was inlined in HomeScreen and shipped with a known
 * bug: pressing the FAB toggled `modalOpen` correctly (the FAB icon would
 * morph + → ×) but the sheet itself never appeared on Android — the
 * comment in HomeScreen even acknowledged "(which is the bug from the
 * screenshot)". The actual root cause wasn't Reanimated layout animations
 * (the previous suspect); it was two missing native-Modal props.
 *
 * ─── The fix ────────────────────────────────────────────────────────────
 * 1. `statusBarTranslucent` — this app draws an edge-to-edge LiquidGlass
 *    background under the status bar. Without this prop, RN's <Modal> on
 *    Android computes its top offset from the *non-translucent* status bar
 *    height, then the `slide` animation translates the sheet by the *full*
 *    screen height — pushing the sheet completely off the visible area.
 *    Setting `statusBarTranslucent` aligns the Modal's coordinate space
 *    with the host app, and the slide lands where it should.
 *
 * 2. `hardwareAccelerated` — required for the slide animation to render
 *    reliably across Android OEM skins. Without it some devices show the
 *    sheet at its final position with no slide, or omit it entirely on
 *    the first open.
 *
 * 3. Backdrop pattern: `Pressable` (backdrop) wrapping `Pressable` (sheet
 *    with `e.stopPropagation()`) — same pattern used by TimePickerModal
 *    in this codebase, which works reliably. The previous version used
 *    a sibling `<Pressable style={absoluteFill} />` next to the sheet,
 *    which is fragile because z-ordering relies purely on source order.
 *
 * 4. Safe-area bottom inset — keeps the sheet clear of the gesture nav
 *    pill on newer Android phones.
 */
export function AddTaskModal({ visible, loading, onClose, onSubmit }: Props) {
  const [draft, setDraft] = useState('');
  const insets = useSafeAreaInsets();

  // Clear draft whenever the sheet re-opens, so a previously-typed title
  // doesn't ghost back into the field.
  useEffect(() => {
    if (visible) setDraft('');
  }, [visible]);

  const submit = () => {
    const title = draft.trim();
    if (!title || loading) return;
    onSubmit(title);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      hardwareAccelerated
    >
      {/* Backdrop wraps the sheet — tapping outside the sheet closes; the
          inner Pressable's stopPropagation prevents taps on the sheet from
          bubbling up and dismissing it. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.sheet,
              {
                paddingBottom:
                  spacing.xl + Math.max(insets.bottom, 8),
              },
            ]}
          >
            <View style={styles.handle} />
            <Text style={styles.title}>New task</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="What do you want to get done?"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoFocus
              onSubmitEditing={submit}
              returnKeyType="done"
              editable={!loading}
              maxLength={200}
            />
            <Button
              label="Add task"
              variant="accent"
              loading={loading}
              disabled={!draft.trim() || loading}
              onPress={submit}
            />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 35, 0.55)',
    justifyContent: 'flex-end',
  },
  kav: {
    width: '100%',
  },
  sheet: {
    width: '100%',
    backgroundColor: colors.surfaceStrong,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderColor: colors.borderStrong,
    ...elevation.lg,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.textDisabled,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 16,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.md,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
});
