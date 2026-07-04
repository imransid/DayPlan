import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, PressScale } from '../../components/UI';
import { ChevronLeftIcon } from '../../components/Icon';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { PasscodeModal } from '../../components/PasscodeModal';
import { colors, spacing, radius, fontSize, elevation } from '../../theme';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { addNote, updateNote, deleteNote, setNoteLocked } from '../../store/slices/notesSlice';
import { removeAttachment } from '../../services/attachmentStorage';
import { useAttachmentPicker } from '../../hooks/useAttachmentPicker';
import { useLock } from '../../context/LockContext';
import type { MainStackParamList } from '../../navigation/types';
import type { Note, NoteAttachment } from '../../types';

type Nav = NativeStackNavigationProp<MainStackParamList, 'NoteEditor'>;
type R = RouteProp<MainStackParamList, 'NoteEditor'>;

function newId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function NoteEditorScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { pickMedia, pickFile, isBusy } = useAttachmentPicker();

  const noteId = route.params?.noteId;
  const existing = useAppSelector((s) =>
    noteId ? s.notes.items.find((n) => n.id === noteId) : undefined,
  );

  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [attachment, setAttachment] = useState<NoteAttachment | null>(existing?.attachment ?? null);

  // ── Lock state ──────────────────────────────────────────────────────────
  const { hasPasscode, isUnlocked, unlock, verifyPasscode, setPasscode } = useLock();
  const isLocked = !!existing?.locked;
  // A note is gated when it's locked and not unlocked in this session. New
  // (unsaved) notes are never gated.
  const gated = !!existing && isLocked && !isUnlocked(existing.id);
  // Passcode modal: 'enter' to open a gated note, 'set' to create the app
  // passcode when locking the first note.
  const [passcodeMode, setPasscodeMode] = useState<'enter' | 'set' | null>(null);

  // Auto-prompt for the passcode when arriving at (or returning to) a gated
  // note — e.g. deep link, or the app was backgrounded and re-locked while the
  // editor was open.
  useEffect(() => {
    if (gated) setPasscodeMode('enter');
  }, [gated]);

  // File lifecycle: the original persisted file (if editing), and every file
  // freshly copied into the sandbox during this session. On save we keep the
  // final one and delete the rest; on cancel we delete all freshly-picked ones.
  const originalPath = useRef(existing?.attachment?.relativePath ?? null);
  const pickedPaths = useRef<string[]>([]);
  const savedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (!savedRef.current) {
        // Cancelled — drop any orphan files we copied but never persisted.
        pickedPaths.current.forEach((p) => removeAttachment(p));
      }
    };
  }, []);

  const applyPicked = (picked: NoteAttachment | null) => {
    if (!picked) return;
    pickedPaths.current.push(picked.relativePath);
    setAttachment(picked);
  };

  const canSave = title.trim().length > 0 || body.trim().length > 0 || attachment !== null;

  const onSave = async () => {
    if (!canSave) return;
    savedRef.current = true;
    const finalPath = attachment?.relativePath ?? null;

    // Delete the previous original if it was replaced/removed, plus any picked
    // files that didn't end up as the final attachment. Await BEFORE persisting
    // so on-disk file state can't lag behind the saved note if the app is
    // killed mid-write (which would otherwise orphan the old file).
    const toDelete: Array<string | null> = [];
    if (originalPath.current && originalPath.current !== finalPath) {
      toDelete.push(originalPath.current);
    }
    pickedPaths.current.filter((p) => p !== finalPath).forEach((p) => toDelete.push(p));
    await Promise.allSettled(toDelete.map((p) => removeAttachment(p)));

    if (existing) {
      dispatch(updateNote({ id: existing.id, changes: { title, body, attachment } }));
    } else {
      const now = new Date().toISOString();
      const note: Note = {
        id: newId(),
        title,
        body,
        createdAt: now,
        updatedAt: now,
        attachment,
      };
      dispatch(addNote(note));
    }
    navigation.goBack();
  };

  const onDelete = () => {
    if (!existing) return;
    Alert.alert('Delete note?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          savedRef.current = true;
          await Promise.allSettled([
            removeAttachment(originalPath.current),
            ...pickedPaths.current.map((p) => removeAttachment(p)),
          ]);
          dispatch(deleteNote(existing.id));
          navigation.goBack();
        },
      },
    ]);
  };

  // ── Lock/unlock controls ────────────────────────────────────────────────
  const lockNote = () => {
    if (!existing) return;
    dispatch(setNoteLocked({ id: existing.id, locked: true }));
    // Keep it viewable for the rest of this session (the user just locked it).
    unlock(existing.id);
  };

  const onToggleLock = () => {
    if (!existing) {
      Alert.alert('Save first', 'Save this note before locking it.');
      return;
    }
    if (isLocked) {
      Alert.alert('Remove lock?', 'This note will no longer need a passcode to open.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove lock',
          onPress: () => dispatch(setNoteLocked({ id: existing.id, locked: false })),
        },
      ]);
      return;
    }
    // Locking: create the app passcode first if there isn't one yet.
    if (hasPasscode) {
      lockNote();
    } else {
      setPasscodeMode('set');
    }
  };

  const handlePasscodeSubmit = (passcode: string): boolean => {
    if (passcodeMode === 'set') {
      // First-ever passcode → save it, then lock this note.
      setPasscode(passcode);
      if (existing) {
        dispatch(setNoteLocked({ id: existing.id, locked: true }));
        unlock(existing.id);
      }
      setPasscodeMode(null);
      return true;
    }
    // 'enter' → unlock a gated note.
    if (!existing || !verifyPasscode(passcode)) return false;
    unlock(existing.id);
    setPasscodeMode(null);
    return true;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <PressScale
            onPress={() => navigation.goBack()}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronLeftIcon size={22} color={colors.textPrimary} />
          </PressScale>
          <Text style={styles.headerTitle}>{existing ? 'Edit note' : 'New note'}</Text>
          {existing ? (
            <View style={styles.headerActions}>
              <PressScale
                onPress={onToggleLock}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={isLocked ? 'Remove lock' : 'Lock note'}
              >
                <Text style={styles.lockGlyph}>{isLocked ? '🔒' : '🔓'}</Text>
              </PressScale>
              {!gated && (
                <PressScale
                  onPress={onDelete}
                  style={styles.iconBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Delete note"
                >
                  <View style={styles.trashLid} />
                  <View style={styles.trashBody} />
                </PressScale>
              )}
            </View>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        {gated ? (
          <View style={styles.gatedWrap}>
            <Text style={styles.gatedGlyph}>🔒</Text>
            <Text style={styles.gatedTitle}>This note is locked</Text>
            <Text style={styles.gatedSub}>
              Enter your passcode to view and edit it.
            </Text>
            <Button
              label="Unlock"
              variant="accent"
              fullWidth={false}
              onPress={() => setPasscodeMode('enter')}
              style={styles.gatedBtn}
            />
          </View>
        ) : (
          <>
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: spacing.xl + Math.max(insets.bottom, 8),
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={colors.textMuted}
            style={styles.titleInput}
            maxLength={120}
          />

          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Write your note…"
            placeholderTextColor={colors.textMuted}
            style={styles.bodyInput}
            multiline
            textAlignVertical="top"
          />

          {attachment ? (
            <View style={{ marginTop: spacing.lg }}>
              <AttachmentPreview attachment={attachment} onRemove={() => setAttachment(null)} />
            </View>
          ) : (
            <View style={styles.attachRow}>
              <Button
                label="Photo / Video"
                variant="secondary"
                fullWidth={false}
                loading={isBusy}
                disabled={isBusy}
                onPress={async () => applyPicked(await pickMedia())}
                style={styles.attachBtn}
              />
              <Button
                label="File"
                variant="outline"
                fullWidth={false}
                disabled={isBusy}
                onPress={async () => applyPicked(await pickFile())}
                style={styles.attachBtn}
              />
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button label={existing ? 'Save changes' : 'Save note'} variant="accent" disabled={!canSave} onPress={onSave} />
        </View>
          </>
        )}

        <PasscodeModal
          visible={passcodeMode !== null}
          mode={passcodeMode === 'set' ? 'set' : 'enter'}
          onClose={() => {
            const backOut = passcodeMode === 'enter' && gated;
            setPasscodeMode(null);
            // Backing out of unlocking a gated note leaves the screen — there's
            // nothing to show behind it.
            if (backOut) navigation.goBack();
          }}
          onSubmit={handlePasscodeSubmit}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  lockGlyph: { fontSize: 18 },
  gatedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  gatedGlyph: { fontSize: 44, marginBottom: spacing.md },
  gatedTitle: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  gatedSub: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  gatedBtn: { marginTop: spacing.lg, paddingHorizontal: 32 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    paddingVertical: spacing.sm,
  },
  bodyInput: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    lineHeight: 22,
    minHeight: 160,
    paddingVertical: spacing.sm,
  },
  attachRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  attachBtn: { flex: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  // Simple trash glyph (View primitives, matching the Icon kit style)
  trashLid: {
    position: 'absolute',
    top: 12,
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.danger,
  },
  trashBody: {
    top: 2,
    width: 12,
    height: 13,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    borderWidth: 1.8,
    borderTopWidth: 0,
    borderColor: colors.danger,
  },
});
