import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { DateTime } from 'luxon';

import { PressScale } from '../../components/UI';
import { ChevronLeftIcon } from '../../components/Icon';
import { colors, spacing, radius, fontSize, elevation } from '../../theme';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { restoreNotes, permanentlyDeleteNotes } from '../../store/slices/notesSlice';
import { removeAttachment } from '../../services/attachmentStorage';
import type { Note } from '../../types';

const TRASH_TTL_DAYS = 30;

export function RecentlyDeletedScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => s.notes.items);

  const trashed = useMemo(
    () =>
      items
        .filter((n) => n.deletedAt)
        .sort(
          (a, b) =>
            DateTime.fromISO(b.deletedAt!).toMillis() - DateTime.fromISO(a.deletedAt!).toMillis(),
        ),
    [items],
  );

  const purge = async (notes: Note[]) => {
    await Promise.allSettled(notes.map((n) => removeAttachment(n.attachment?.relativePath)));
    dispatch(permanentlyDeleteNotes(notes.map((n) => n.id)));
  };

  const onRestore = (note: Note) => dispatch(restoreNotes([note.id]));

  const onDelete = (note: Note) => {
    Alert.alert('Delete permanently?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => purge([note]) },
    ]);
  };

  const onEmpty = () => {
    if (!trashed.length) return;
    Alert.alert('Empty Recently deleted?', `Permanently delete ${trashed.length} note(s).`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Empty', style: 'destructive', onPress: () => purge(trashed) },
    ]);
  };

  const daysLeft = (n: Note) => {
    const expires = DateTime.fromISO(n.deletedAt!).plus({ days: TRASH_TTL_DAYS });
    const d = Math.ceil(expires.diff(DateTime.now(), 'days').days);
    return Math.max(0, d);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <PressScale onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Back">
          <ChevronLeftIcon size={22} color={colors.textPrimary} />
        </PressScale>
        <Text style={styles.headerTitle}>Recently deleted</Text>
        <Pressable onPress={onEmpty} hitSlop={8} style={styles.iconBtn}>
          <Text style={[styles.empty, !trashed.length && { opacity: 0.35 }]}>Empty</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {trashed.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyGlyph}>🗑</Text>
            <Text style={styles.emptyTitle}>Nothing here</Text>
            <Text style={styles.emptySub}>
              Deleted notes appear here for {TRASH_TTL_DAYS} days before they’re removed for good.
            </Text>
          </View>
        ) : (
          trashed.map((n) => (
            <View key={n.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {n.locked ? 'Locked note' : n.title.trim() || 'Untitled'}
                </Text>
                {!n.locked && !!n.body.trim() && (
                  <Text style={styles.cardBody} numberOfLines={1}>
                    {n.body.trim()}
                  </Text>
                )}
                <Text style={styles.cardMeta}>{daysLeft(n)} days left</Text>
              </View>
              <PressScale onPress={() => onRestore(n)} style={styles.pillBtn}>
                <Text style={styles.pillText}>Restore</Text>
              </PressScale>
              <PressScale onPress={() => onDelete(n)} style={styles.iconBtn} accessibilityLabel="Delete permanently">
                <Text style={styles.trashGlyph}>🗑</Text>
              </PressScale>
            </View>
          ))
        )}
      </ScrollView>
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
  iconBtn: { minWidth: 44, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: fontSize.title, fontWeight: '700', color: colors.textPrimary },
  empty: { fontSize: 15, fontWeight: '700', color: colors.danger, paddingHorizontal: 6 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...elevation.sm,
  },
  cardTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  cardBody: { fontSize: fontSize.small, color: colors.textSecondary, marginTop: 2 },
  cardMeta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 4 },
  pillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  pillText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  trashGlyph: { fontSize: 18 },

  emptyBox: { alignItems: 'center', paddingTop: 100, paddingHorizontal: spacing.xl },
  emptyGlyph: { fontSize: 44, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.title, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: fontSize.body, color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 21 },
});
