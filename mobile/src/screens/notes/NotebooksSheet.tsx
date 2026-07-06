import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Alert } from 'react-native';

import { PressScale } from '../../components/UI';
import { AppModal } from '../../components/AppModal';
import { colors, spacing, radius, fontSize, elevation } from '../../theme';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import {
  createNotebook,
  renameNotebook,
  deleteNotebook,
  moveNotes,
} from '../../store/slices/notesSlice';
import { DEFAULT_NOTEBOOK_ID } from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** When set, picking a notebook MOVES these notes into it instead of filtering. */
  moveIds?: string[];
  onMoved?: () => void;
  onOpenTrash: () => void;
  onPickFilter: (f: 'all' | 'locked' | string) => void;
  trashCount: number;
  lockedCount: number;
}

function newNotebookId(): string {
  return `nb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function NotebooksSheet({
  visible,
  onClose,
  moveIds,
  onMoved,
  onOpenTrash,
  onPickFilter,
  trashCount,
  lockedCount,
}: Props) {
  const dispatch = useAppDispatch();
  const notebooks = useAppSelector((s) => s.notes.notebooks ?? []);
  const items = useAppSelector((s) => s.notes.items);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const moving = !!moveIds && moveIds.length > 0;

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    let all = 0;
    items.forEach((n) => {
      if (n.deletedAt) return;
      all += 1;
      const id = n.notebookId ?? DEFAULT_NOTEBOOK_ID;
      map[id] = (map[id] ?? 0) + 1;
    });
    return { map, all };
  }, [items]);

  const submitNew = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreating(false);
      return;
    }
    const id = newNotebookId();
    dispatch(createNotebook({ id, name: trimmed }));
    setName('');
    setCreating(false);
    if (moving && moveIds) {
      dispatch(moveNotes({ ids: moveIds, notebookId: id }));
      onMoved?.();
      onClose();
    }
  };

  const pickNotebook = (id: string) => {
    if (moving && moveIds) {
      dispatch(moveNotes({ ids: moveIds, notebookId: id }));
      onMoved?.();
      onClose();
    } else {
      onPickFilter(id);
    }
  };

  const onLongPressNotebook = (id: string, currentName: string) => {
    if (id === DEFAULT_NOTEBOOK_ID) return;
    Alert.alert(currentName, undefined, [
      {
        text: 'Rename',
        onPress: () =>
          Alert.prompt
            ? Alert.prompt('Rename notebook', undefined, (t) => {
                if (t?.trim()) dispatch(renameNotebook({ id, name: t.trim() }));
              }, 'plain-text', currentName)
            : dispatch(renameNotebook({ id, name: currentName })),
      },
      {
        text: 'Delete notebook',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Delete notebook?',
            'Its notes move to the Default notebook.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => dispatch(deleteNotebook(id)) },
            ],
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <AppModal visible={visible} onClose={onClose} variant="sheet" contentStyle={styles.sheet}>
      <View style={styles.grabber} />
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{moving ? 'Move to notebook' : 'Notebooks'}</Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
            {!moving && (
              <Row
                label="All notes"
                icon="📄"
                trailing={String(counts.all)}
                highlighted
                onPress={() => {
                  onPickFilter('all');
                  onClose();
                }}
              />
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>MY NOTEBOOKS</Text>
              <Pressable onPress={() => setCreating(true)} hitSlop={8}>
                <Text style={styles.newBtn}>New</Text>
              </Pressable>
            </View>

            <View style={styles.group}>
              {creating && (
                <View style={styles.createRow}>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Notebook name"
                    placeholderTextColor={colors.textMuted}
                    style={styles.createInput}
                    autoFocus
                    onSubmitEditing={submitNew}
                    returnKeyType="done"
                    maxLength={40}
                  />
                  <Pressable onPress={submitNew} hitSlop={8}>
                    <Text style={styles.createSave}>Save</Text>
                  </Pressable>
                </View>
              )}
              {notebooks.map((nb, i) => (
                <Row
                  key={nb.id}
                  label={nb.name}
                  icon="📓"
                  trailing={String(counts.map[nb.id] ?? 0)}
                  divider={i < notebooks.length - 1}
                  onPress={() => pickNotebook(nb.id)}
                  onLongPress={() => onLongPressNotebook(nb.id, nb.name)}
                />
              ))}
            </View>

            {!moving && (
              <View style={styles.group}>
                <Row
                  label="Locked notes"
                  icon="🔒"
                  trailing={lockedCount > 0 ? String(lockedCount) : '🔒'}
                  divider
                  onPress={() => {
                    onPickFilter('locked');
                    onClose();
                  }}
                />
                <Row
                  label="Recently deleted"
                  icon="🗑"
                  trailing={String(trashCount)}
                  onPress={onOpenTrash}
                />
              </View>
            )}
          </ScrollView>
    </AppModal>
  );
}

function Row({
  label,
  icon,
  trailing,
  onPress,
  onLongPress,
  divider,
  highlighted,
}: {
  label: string;
  icon: string;
  trailing?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  divider?: boolean;
  highlighted?: boolean;
}) {
  return (
    <PressScale
      onPress={onPress}
      onLongPress={onLongPress}
      scaleTo={0.99}
      style={[
        styles.row,
        highlighted && styles.rowHighlighted,
        divider && styles.rowDivider,
      ]}
    >
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      {trailing !== undefined && <Text style={styles.rowTrailing}>{trailing}</Text>}
      <Text style={styles.rowChevron}>›</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
    paddingTop: spacing.sm,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textDisabled,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  // flexShrink lets the list scroll INSIDE the maxHeight-capped sheet (RN
  // ScrollViews default to flexShrink:0 and would otherwise overflow).
  scroll: { flexShrink: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { fontSize: 20, color: colors.textPrimary, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.title, fontWeight: '700', color: colors.textPrimary },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.6 },
  newBtn: { fontSize: 15, fontWeight: '700', color: colors.warm },

  group: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...elevation.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 15,
    backgroundColor: colors.surfaceStrong,
  },
  rowHighlighted: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...elevation.sm,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(15,15,30,0.08)' },
  rowIcon: { fontSize: 18 },
  rowLabel: { flex: 1, fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  rowTrailing: { fontSize: fontSize.body, color: colors.textMuted, fontWeight: '600' },
  rowChevron: { fontSize: 20, color: colors.textMuted, marginLeft: 4 },

  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,15,30,0.08)',
  },
  createInput: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
  createSave: { fontSize: 15, fontWeight: '700', color: colors.accent },
});
