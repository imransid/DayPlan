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
import { colors, spacing, radius, fontSize, elevation } from '../../theme';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { addNote, updateNote, deleteNote } from '../../store/slices/notesSlice';
import { removeAttachment } from '../../services/attachmentStorage';
import { useAttachmentPicker } from '../../hooks/useAttachmentPicker';
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
            <PressScale
              onPress={onDelete}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Delete note"
            >
              <View style={styles.trashLid} />
              <View style={styles.trashBody} />
            </PressScale>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

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
