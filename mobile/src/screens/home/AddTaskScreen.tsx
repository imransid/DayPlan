import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button } from '../../components/UI';
import { colors, spacing, radius, elevation } from '../../theme';
import { useCreateTaskMutation } from '../../store/api/api';
import type { MainStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList, 'AddTask'>;
type R = RouteProp<MainStackParamList, 'AddTask'>;

/**
 * Add-task bottom sheet — implemented as a real navigation screen rather
 * than a React Native <Modal>.
 *
 * ─── Why a screen instead of a Modal ──────────────────────────────────
 * The previous implementation used <Modal> with `animationType="slide"`.
 * On Android, with this app's edge-to-edge translucent status bar, the
 * sheet rendered off-screen — the FAB icon would morph + → × (proving
 * state was correct) but the sheet was nowhere to be seen. Even after
 * adding `statusBarTranslucent` and `hardwareAccelerated`, certain OEM
 * builds and gesture-nav configurations still mis-positioned the sheet.
 *
 * Native-stack screens with `presentation: 'transparentModal'` sidestep
 * the entire RN Modal subsystem. The previous screen stays mounted and
 * visible underneath, the slide_from_bottom animation runs on the native
 * side, and the host app's status bar / nav bar are respected because
 * we're just another screen in the stack — not a separate window.
 *
 * ─── Layout pattern ───────────────────────────────────────────────────
 * Outer Pressable fills the screen and acts as the dim backdrop; tapping
 * it calls navigation.goBack(). Inner Pressable wraps the sheet and uses
 * stopPropagation so taps inside the sheet don't bubble up and dismiss.
 * This is the same proven pattern used by TimePickerModal.
 *
 * KeyboardAvoidingView only kicks in on iOS — Android handles keyboard
 * insets through android:windowSoftInputMode in AndroidManifest.
 */
export function AddTaskScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const insets = useSafeAreaInsets();
  const [createTask, { isLoading: creating }] = useCreateTaskMutation();

  const [title, setTitle] = useState('');

  // Hardware back: handled by native-stack automatically. No custom
  // BackHandler needed — leaving this comment so the next dev doesn't
  // wonder why we don't intercept it.

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  const submit = useCallback(() => {
    const t = title.trim();
    if (!t || creating) return;
    // Optimistic close: dismiss the sheet immediately, then fire the
    // mutation. RTK Query invalidates the "Tasks" tag, so the list on
    // HomeScreen refreshes automatically when the response lands. If
    // the request fails, the row simply doesn't appear — acceptable
    // for a quick-add UI.
    close();
    createTask({ title: t, date: route.params?.date });
  }, [title, creating, route.params?.date, close, createTask]);

  return (
    <Pressable style={styles.backdrop} onPress={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            { paddingBottom: spacing.xl + Math.max(insets.bottom, 8) },
          ]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>New task</Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What do you want to get done?"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoFocus
            onSubmitEditing={submit}
            returnKeyType="done"
            editable={!creating}
            maxLength={200}
          />

          <Button
            label="Add task"
            variant="accent"
            loading={creating}
            disabled={!title.trim() || creating}
            onPress={submit}
          />
        </Pressable>
      </KeyboardAvoidingView>
    </Pressable>
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