import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn, LinearTransition } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DateTime } from 'luxon';

import { Heading, PressScale } from '../../components/UI';
import { PlusIcon } from '../../components/Icon';
import { colors, spacing, radius, motion, elevation, glass, fontSize } from '../../theme';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { deleteNote } from '../../store/slices/notesSlice';
import { removeAttachment } from '../../services/attachmentStorage';
import type { MainStackParamList } from '../../navigation/types';
import type { Note, AttachmentKind } from '../../types';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const KIND_LABEL: Record<AttachmentKind, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Audio',
  file: 'File',
};

export function NotesListScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const notes = useAppSelector((s) => s.notes.items);

  const confirmDelete = (note: Note) => {
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
  };

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
              <Pressable
                onPress={() => navigation.navigate('NoteEditor', { noteId: note.id })}
                onLongPress={() => confirmDelete(note)}
                style={styles.card}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {note.title.trim() || 'Untitled'}
                  </Text>
                  <Text style={styles.cardDate}>
                    {DateTime.fromISO(note.updatedAt).toRelative() ?? ''}
                  </Text>
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
            </Animated.View>
          ))
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

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
