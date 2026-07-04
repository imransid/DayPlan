import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn, LinearTransition } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DateTime } from 'luxon';

import { Heading, PressScale } from '../../components/UI';
import { PlusIcon } from '../../components/Icon';
import { PasscodeModal } from '../../components/PasscodeModal';
import { colors, spacing, radius, motion, elevation, glass, fontSize } from '../../theme';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { deleteNote } from '../../store/slices/notesSlice';
import { removeAttachment } from '../../services/attachmentStorage';
import { useLock } from '../../context/LockContext';
import type { MainStackParamList } from '../../navigation/types';
import type { Note, AttachmentKind } from '../../types';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const KIND_LABEL: Record<AttachmentKind, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Audio',
  file: 'File',
};

/** A pending action that requires a passcode before it can run. */
type PendingAction = { note: Note; action: 'open' | 'delete' } | null;

export function NotesListScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const notes = useAppSelector((s) => s.notes.items);
  const { isUnlocked, unlock, verifyPasscode } = useLock();

  const [pending, setPending] = useState<PendingAction>(null);

  const doDelete = useCallback(
    (note: Note) => {
      Alert.alert('Delete note?', 'This can’t be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await removeAttachment(note.attachment?.relativePath);
            dispatch(deleteNote(note.id));
          },
        },
      ]);
    },
    [dispatch],
  );

  // Open a note. Locked notes prompt for the passcode first (unless already
  // unlocked this session).
  const handleOpen = useCallback(
    (note: Note) => {
      if (note.locked && !isUnlocked(note.id)) {
        setPending({ note, action: 'open' });
        return;
      }
      navigation.navigate('NoteEditor', { noteId: note.id });
    },
    [isUnlocked, navigation],
  );

  // Long-press to delete. A locked note must be unlocked first so someone can't
  // wipe a private note without the passcode.
  const handleLongPress = useCallback(
    (note: Note) => {
      if (note.locked && !isUnlocked(note.id)) {
        setPending({ note, action: 'delete' });
        return;
      }
      doDelete(note);
    },
    [isUnlocked, doDelete],
  );

  const handlePasscodeSubmit = useCallback(
    (passcode: string): boolean => {
      if (!pending) return false;
      if (!verifyPasscode(passcode)) return false;
      const { note, action } = pending;
      unlock(note.id);
      setPending(null);
      // Defer the follow-up so the modal is fully dismissed first.
      setTimeout(() => {
        if (action === 'open') {
          navigation.navigate('NoteEditor', { noteId: note.id });
        } else {
          doDelete(note);
        }
      }, 0);
      return true;
    },
    [pending, verifyPasscode, unlock, navigation, doDelete],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Animated.View
          entering={FadeInDown.duration(motion.base).easing(motion.easeOut)}
          style={{ flex: 1 }}
        >
          <Heading subtitle={notes.length ? `${notes.length} saved` : 'Capture a thought'}>
            Notes
          </Heading>
        </Animated.View>
        <PressScale
          onPress={() => navigation.navigate('NoteEditor', {})}
          style={styles.addBtn}
          accessibilityRole="button"
          accessibilityLabel="New note"
        >
          <PlusIcon size={22} color={colors.primaryText} weight={2.4} />
        </PressScale>
      </View>

      <Animated.ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {notes.length === 0 ? (
          <Animated.View entering={FadeIn.duration(motion.base).delay(150)} style={styles.empty}>
            <View style={styles.emptyOrb}>
              <Text style={styles.emptyOrbText}>✍️</Text>
            </View>
            <Text style={styles.emptyTitle}>No notes yet</Text>
            <Text style={styles.emptySub}>
              Tap + to jot something down — attach a photo, video, audio clip, or file.
            </Text>
          </Animated.View>
        ) : (
          notes.map((note, index) => (
            <Animated.View
              key={note.id}
              entering={FadeInDown.duration(motion.base)
                .delay(Math.min(index, 6) * 40)
                .easing(motion.easeOut)}
              layout={LinearTransition.springify().damping(20).stiffness(180)}
            >
              <NoteCard
                note={note}
                onOpen={handleOpen}
                onLongPress={handleLongPress}
              />
            </Animated.View>
          ))
        )}
      </Animated.ScrollView>

      <PasscodeModal
        visible={pending !== null}
        mode="enter"
        subtitle={
          pending?.action === 'delete'
            ? 'Unlock this note to delete it.'
            : 'This note is locked.'
        }
        onClose={() => setPending(null)}
        onSubmit={handlePasscodeSubmit}
      />
    </SafeAreaView>
  );
}

/**
 * A single note card. Locked notes render redacted — the title, body and
 * attachment are never placed in the view tree, only a lock affordance — so
 * their content can't be read (or screenshotted) from the list.
 *
 * Memoized: with stable id-based handlers, editing/deleting one note doesn't
 * re-render (or re-run the relative-date formatting for) every other card.
 */
const NoteCard = React.memo(function NoteCard({
  note,
  onOpen,
  onLongPress,
}: {
  note: Note;
  onOpen: (note: Note) => void;
  onLongPress: (note: Note) => void;
}) {
  const relative = DateTime.fromISO(note.updatedAt).toRelative() ?? '';

  if (note.locked) {
    return (
      <Pressable
        onPress={() => onOpen(note)}
        onLongPress={() => onLongPress(note)}
        style={[styles.card, styles.lockedCard]}
      >
        <View style={styles.lockedRow}>
          <View style={styles.lockBadge}>
            <Text style={styles.lockGlyph}>🔒</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.lockedTitle}>Locked note</Text>
            <Text style={styles.lockedSub}>Tap to unlock · {relative}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => onOpen(note)}
      onLongPress={() => onLongPress(note)}
      style={styles.card}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {note.title.trim() || 'Untitled'}
        </Text>
        <Text style={styles.cardDate}>{relative}</Text>
      </View>
      {!!note.body.trim() && (
        <Text style={styles.cardBody} numberOfLines={2}>
          {note.body.trim()}
        </Text>
      )}
      {note.attachment && (
        <View style={styles.attachPill}>
          <View style={styles.attachDot} />
          <Text style={styles.attachText}>{KIND_LABEL[note.attachment.kind]}</Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.md,
  },
  card: {
    ...glass.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: fontSize.title, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.2 },
  cardDate: { fontSize: fontSize.caption, color: colors.textMuted },
  cardBody: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: 6, lineHeight: 20 },
  attachPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  attachDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  attachText: { fontSize: fontSize.caption, color: colors.accent, fontWeight: '700', letterSpacing: 0.3 },
  // ── Locked card ──
  lockedCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.06)',
    borderColor: 'rgba(99, 102, 241, 0.18)',
  },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lockBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.22)',
  },
  lockGlyph: { fontSize: 18 },
  lockedTitle: { fontSize: fontSize.title, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.2 },
  lockedSub: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  // Empty state
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyOrb: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(199, 210, 254, 0.45)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyOrbText: { fontSize: 40 },
  emptyTitle: { fontSize: fontSize.title, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: fontSize.body, color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 21 },
});
