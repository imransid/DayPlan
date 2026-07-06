import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Image,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DateTime } from 'luxon';

import { PressScale } from '../../components/UI';
import { PlusIcon, SearchIcon } from '../../components/Icon';
import { PasscodeModal } from '../../components/PasscodeModal';
import { stripMarkdown } from '../../components/MarkdownText';
import { NotebooksSheet } from './NotebooksSheet';
import { colors, spacing, radius, motion, elevation, fontSize } from '../../theme';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import {
  setManyPinned,
  setManyLocked,
  trashNotes,
  permanentlyDeleteNotes,
  setViewMode,
  DEFAULT_NOTEBOOK,
} from '../../store/slices/notesSlice';
import { absoluteUri, removeAttachment } from '../../services/attachmentStorage';
import { useLock } from '../../context/LockContext';
import { DEFAULT_NOTEBOOK_ID } from '../../types';
import type { MainStackParamList } from '../../navigation/types';
import type { Note } from '../../types';

type Nav = NativeStackNavigationProp<MainStackParamList>;

/** 'all' = every active note; 'locked' = the locked-notes view; else a notebookId. */
type Filter = 'all' | 'locked' | string;

const isActive = (n: Note) => !n.deletedAt;

export function NotesListScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  // The app's custom bottom tab bar is 64pt + the bottom safe-area inset; the
  // FAB and select-action bar sit ABOVE it.
  const tabBar = 64 + insets.bottom;
  const allNotes = useAppSelector((s) => s.notes.items);
  // Fall back to the built-in default notebook / 'grid' for users whose
  // persisted state predates these fields (the default reconciler doesn't seed
  // them — see store.ts). The notebook reducers seed the same default on write.
  const notebooks = useAppSelector((s) => s.notes.notebooks ?? [DEFAULT_NOTEBOOK]);
  const viewMode = useAppSelector((s) => s.notes.viewMode ?? 'grid');
  const { isUnlocked, unlock, verifyPasscode, hasPasscode, setPasscode } = useLock();

  const [filter, setFilter] = useState<Filter>('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [pinCollapsed, setPinCollapsed] = useState(false);
  const [notebooksOpen, setNotebooksOpen] = useState(false);

  // Multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // Passcode prompt for opening/unlocking a gated note, and for batch-locking.
  const [pending, setPending] = useState<{ note: Note; action: 'open' } | null>(null);
  const [batchLock, setBatchLock] = useState<string[] | null>(null);

  // Purge trashed notes older than 30 days (once per mount). Removes their
  // attachment files first, then hard-deletes the rows.
  useEffect(() => {
    const cutoff = DateTime.now().minus({ days: 30 });
    const expired = allNotes.filter(
      (n) => n.deletedAt && DateTime.fromISO(n.deletedAt) < cutoff,
    );
    if (!expired.length) return;
    Promise.allSettled(expired.map((n) => removeAttachment(n.attachment?.relativePath))).then(
      () => dispatch(permanentlyDeleteNotes(expired.map((n) => n.id))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeNotes = useMemo(() => allNotes.filter(isActive), [allNotes]);
  const trashCount = useMemo(() => allNotes.length - activeNotes.length, [allNotes, activeNotes]);
  const lockedCount = useMemo(
    () => activeNotes.filter((n) => n.locked).length,
    [activeNotes],
  );

  // Notes to display for the current filter + search, newest-first.
  const visible = useMemo(() => {
    let list = activeNotes;
    if (filter === 'locked') list = list.filter((n) => n.locked);
    else if (filter !== 'all')
      list = list.filter((n) => (n.notebookId ?? DEFAULT_NOTEBOOK_ID) === filter);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          // Don't leak locked content through search — EXCEPT in the locked
          // view, which the user opened intentionally (otherwise every query
          // there matches nothing).
          (filter === 'locked' || !n.locked) &&
          (n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)),
      );
    }
    return [...list].sort(
      (a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis(),
    );
  }, [activeNotes, filter, query]);

  const pinned = useMemo(() => visible.filter((n) => n.pinned), [visible]);
  const others = useMemo(() => visible.filter((n) => !n.pinned), [visible]);

  // Lookup over ALL active notes (not just `visible`) so batch actions stay
  // correct even if the selection outlives a filter change.
  const byId = useMemo(() => new Map(activeNotes.map((n) => [n.id, n])), [activeNotes]);

  // If the selected notebook was deleted, snap back to All notes so the list
  // repopulates and the FAB doesn't stamp new notes with an orphan notebookId.
  useEffect(() => {
    if (filter !== 'all' && filter !== 'locked' && !notebooks.some((nb) => nb.id === filter)) {
      setFilter('all');
    }
  }, [filter, notebooks]);

  const filterLabel =
    filter === 'all'
      ? 'All notes'
      : filter === 'locked'
        ? 'Locked notes'
        : notebooks.find((n) => n.id === filter)?.name ?? 'Notebook';

  // ── Selection ────────────────────────────────────────────────────────────
  const enterSelect = useCallback((id?: string) => {
    setSelectMode(true);
    setSelected(id ? new Set([id]) : new Set());
  }, []);
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback(() => {
    setSelected(new Set(visible.map((n) => n.id)));
  }, [visible]);

  const selectedIds = useMemo(() => [...selected], [selected]);

  // Changing the filter mid-selection would strand selected ids that are no
  // longer visible (batch actions would then hit off-screen notes). Exit select
  // mode whenever the filter changes.
  useEffect(() => {
    if (selectMode) exitSelect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // ── Open / unlock ────────────────────────────────────────────────────────
  const openNote = useCallback(
    (note: Note) => {
      if (note.locked && !isUnlocked(note.id)) {
        setPending({ note, action: 'open' });
        return;
      }
      navigation.navigate('NoteEditor', { noteId: note.id });
    },
    [isUnlocked, navigation],
  );

  const onCardPress = useCallback(
    (note: Note) => {
      if (selectMode) toggleSelect(note.id);
      else openNote(note);
    },
    [selectMode, toggleSelect, openNote],
  );

  const handlePasscodeSubmit = useCallback(
    (passcode: string): boolean => {
      if (!pending) return false;
      if (!verifyPasscode(passcode)) return false;
      const { note } = pending;
      unlock(note.id);
      setPending(null);
      setTimeout(() => navigation.navigate('NoteEditor', { noteId: note.id }), 0);
      return true;
    },
    [pending, verifyPasscode, unlock, navigation],
  );

  // ── Batch actions ──────────────────────────────────────────────────────────
  const doPin = () => {
    if (!selectedIds.length) return;
    // If every selected note is already pinned, unpin; else pin. Look up in the
    // full active set (not `visible`) so it's correct regardless of the filter.
    const allPinned = selectedIds.every((id) => byId.get(id)?.pinned);
    dispatch(setManyPinned({ ids: selectedIds, pinned: !allPinned }));
    exitSelect();
  };

  const doLock = () => {
    if (!selectedIds.length) return;
    if (hasPasscode) {
      dispatch(setManyLocked({ ids: selectedIds, locked: true }));
      exitSelect();
    } else {
      setBatchLock(selectedIds); // prompt to create the passcode first
    }
  };

  const doMove = () => {
    if (!selectedIds.length) return;
    setNotebooksOpen(true); // the sheet's "pick" behavior moves selected notes
  };

  const doDelete = () => {
    if (!selectedIds.length) return;
    const n = selectedIds.length;
    Alert.alert(
      `Delete ${n} note${n === 1 ? '' : 's'}?`,
      'Moved to Recently deleted for 30 days.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            dispatch(trashNotes(selectedIds));
            exitSelect();
          },
        },
      ],
    );
  };

  const handleBatchLockSubmit = useCallback(
    (passcode: string): boolean => {
      if (!batchLock) return false;
      setPasscode(passcode);
      dispatch(setManyLocked({ ids: batchLock, locked: true }));
      setBatchLock(null);
      exitSelect();
      return true;
    },
    [batchLock, setPasscode, dispatch, exitSelect],
  );

  const selectAllPinned =
    selectedIds.length > 0 && selectedIds.every((id) => byId.get(id)?.pinned);

  const empty = visible.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Header ─────────────────────────────────────────────── */}
      {selectMode ? (
        <View style={styles.selHeader}>
          <Pressable onPress={exitSelect} hitSlop={8}>
            <Text style={styles.selAction}>Cancel</Text>
          </Pressable>
          <Text style={styles.selCount}>
            {selectedIds.length ? `${selectedIds.length} selected` : 'Select items'}
          </Text>
          <Pressable onPress={selectAll} hitSlop={8}>
            <Text style={styles.selAction}>Select all</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Notes</Text>
            <Text style={styles.subtitle}>
              {activeNotes.length} note{activeNotes.length === 1 ? '' : 's'}
            </Text>
          </View>
          <PressScale
            onPress={() =>
              setSearching((s) => {
                if (s) setQuery(''); // closing search clears the filter
                return !s;
              })
            }
            style={styles.headerBtn}
            accessibilityLabel="Search"
          >
            <SearchIcon size={20} color={colors.textPrimary} />
          </PressScale>
          <PressScale
            onPress={() =>
              dispatch(setViewMode(viewMode === 'grid' ? 'list' : 'grid'))
            }
            style={styles.headerBtn}
            accessibilityLabel="Toggle layout"
          >
            <LayoutGlyph grid={viewMode === 'grid'} />
          </PressScale>
          <PressScale
            onPress={() => enterSelect()}
            style={styles.headerBtn}
            accessibilityLabel="Select"
          >
            <SelectGlyph />
          </PressScale>
        </View>
      )}

      {/* ── Search ─────────────────────────────────────────────── */}
      {searching && !selectMode && (
        <View style={styles.searchWrap}>
          <SearchIcon size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={styles.searchClear}>✕</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ── Notebook chips ─────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <PressScale onPress={() => setNotebooksOpen(true)} style={styles.chipIcon}>
          <NotebooksGlyph />
        </PressScale>
        <Chip label="All notes" active={filter === 'all'} onPress={() => setFilter('all')} />
        {notebooks.map((nb) => (
          <Chip
            key={nb.id}
            label={nb.name}
            active={filter === nb.id}
            onPress={() => setFilter(nb.id)}
          />
        ))}
        {lockedCount > 0 && (
          <Chip
            label="Locked"
            active={filter === 'locked'}
            onPress={() => setFilter('locked')}
          />
        )}
      </ScrollView>

      {/* ── Content ────────────────────────────────────────────── */}
      <Animated.ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: tabBar + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        {empty ? (
          <Animated.View entering={FadeIn.duration(motion.base).delay(120)} style={styles.emptyBox}>
            <View style={styles.emptyOrb}>
              <Text style={styles.emptyOrbText}>{filter === 'locked' ? '🔒' : '✍️'}</Text>
            </View>
            <Text style={styles.emptyTitle}>
              {query ? 'No matches' : filter === 'locked' ? 'No locked notes' : 'No notes yet'}
            </Text>
            <Text style={styles.emptySub}>
              {query
                ? 'Try a different search.'
                : 'Tap + to jot something down — attach a photo, video, audio, or file.'}
            </Text>
          </Animated.View>
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                <SectionHeader
                  label="Pin"
                  collapsed={pinCollapsed}
                  onToggle={() => setPinCollapsed((c) => !c)}
                />
                {!pinCollapsed &&
                  renderNotes(pinned, viewMode, {
                    selectMode,
                    selected,
                    onPress: onCardPress,
                    onLongPress: (n) => (selectMode ? undefined : enterSelect(n.id)),
                  })}
              </>
            )}
            {others.length > 0 && (
              <>
                {pinned.length > 0 && <Text style={styles.sectionPlain}>Other</Text>}
                {renderNotes(others, viewMode, {
                  selectMode,
                  selected,
                  onPress: onCardPress,
                  onLongPress: (n) => (selectMode ? undefined : enterSelect(n.id)),
                })}
              </>
            )}
          </>
        )}
      </Animated.ScrollView>

      {/* ── FAB ────────────────────────────────────────────────── */}
      {!selectMode && (
        <PressScale
          onPress={() =>
            navigation.navigate('NoteEditor', {
              notebookId: filter !== 'all' && filter !== 'locked' ? filter : undefined,
            })
          }
          style={[styles.fab, { bottom: tabBar + spacing.sm }]}
          accessibilityLabel="New note"
        >
          <PlusIcon size={26} color="#fff" weight={2.6} />
        </PressScale>
      )}

      {/* ── Select action bar ──────────────────────────────────── */}
      {selectMode && (
        <View style={[styles.actionBar, { bottom: tabBar }]}>
          <ActionBtn label="Move" disabled={!selectedIds.length} onPress={doMove} glyph="→" />
          <ActionBtn label="Lock" disabled={!selectedIds.length} onPress={doLock} glyph="🔒" />
          <ActionBtn
            label={selectAllPinned ? 'Unpin' : 'Pin'}
            disabled={!selectedIds.length}
            onPress={doPin}
            glyph="📌"
          />
          <ActionBtn
            label="Delete"
            disabled={!selectedIds.length}
            onPress={doDelete}
            glyph="🗑"
            danger
          />
        </View>
      )}

      {/* ── Modals ─────────────────────────────────────────────── */}
      <NotebooksSheet
        visible={notebooksOpen}
        onClose={() => setNotebooksOpen(false)}
        moveIds={selectMode ? selectedIds : undefined}
        onMoved={exitSelect}
        onOpenTrash={() => {
          setNotebooksOpen(false);
          navigation.navigate('RecentlyDeleted');
        }}
        onPickFilter={(f) => {
          setNotebooksOpen(false);
          setFilter(f);
        }}
        trashCount={trashCount}
        lockedCount={lockedCount}
      />

      <PasscodeModal
        visible={pending !== null}
        mode="enter"
        subtitle="This note is locked."
        onClose={() => setPending(null)}
        onSubmit={handlePasscodeSubmit}
      />
      <PasscodeModal
        visible={batchLock !== null}
        mode="set"
        onClose={() => setBatchLock(null)}
        onSubmit={handleBatchLockSubmit}
      />
    </SafeAreaView>
  );
}

// ── Note rendering (grid or list) ────────────────────────────────────────────
interface RenderOpts {
  selectMode: boolean;
  selected: Set<string>;
  onPress: (n: Note) => void;
  onLongPress: (n: Note) => void;
}

function renderNotes(notes: Note[], viewMode: 'grid' | 'list', opts: RenderOpts) {
  if (viewMode === 'list') {
    return (
      <View style={styles.listWrap}>
        {notes.map((n, i) => (
          <NoteCard
            key={n.id}
            note={n}
            variant="list"
            last={i === notes.length - 1}
            {...opts}
          />
        ))}
      </View>
    );
  }
  // Grid: distribute round-robin into two columns for a staggered masonry look.
  const left = notes.filter((_, i) => i % 2 === 0);
  const right = notes.filter((_, i) => i % 2 === 1);
  return (
    <View style={styles.gridRow}>
      <View style={styles.gridCol}>
        {left.map((n) => (
          <NoteCard key={n.id} note={n} variant="grid" {...opts} />
        ))}
      </View>
      <View style={styles.gridCol}>
        {right.map((n) => (
          <NoteCard key={n.id} note={n} variant="grid" {...opts} />
        ))}
      </View>
    </View>
  );
}

const NoteCard = React.memo(function NoteCard({
  note,
  variant,
  last,
  selectMode,
  selected,
  onPress,
  onLongPress,
}: {
  note: Note;
  variant: 'grid' | 'list';
  last?: boolean;
} & RenderOpts) {
  const date = DateTime.fromISO(note.updatedAt).toLocaleString(DateTime.DATE_SHORT);
  const checked = selected.has(note.id);
  const thumb =
    note.attachment?.kind === 'image' ? absoluteUri(note.attachment.relativePath) : null;

  const body = (
    <>
      {note.locked ? (
        <View style={styles.lockedRow}>
          <View style={styles.lockBadge}>
            <Text style={styles.lockGlyph}>🔒</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              Locked note
            </Text>
            <Text style={styles.cardMeta}>Tap to unlock · {date}</Text>
          </View>
        </View>
      ) : (
        <>
          {!!note.title.trim() && (
            <Text style={styles.cardTitle} numberOfLines={variant === 'grid' ? 2 : 1}>
              {note.title.trim()}
            </Text>
          )}
          {!!note.body.trim() && (
            <Text
              style={[styles.cardBody, !note.title.trim() && { color: colors.textPrimary }]}
              numberOfLines={variant === 'grid' ? 6 : 1}
            >
              {stripMarkdown(note.body).trim()}
            </Text>
          )}
          {!note.body.trim() && note.checklist && note.checklist.length > 0 && (
            <Text style={styles.cardBody} numberOfLines={variant === 'grid' ? 5 : 1}>
              {note.checklist
                .slice(0, 6)
                .map((c) => `${c.done ? '☑' : '☐'} ${c.text}`)
                .join('\n')}
            </Text>
          )}
          {thumb && (
            <Image
              source={{ uri: thumb }}
              style={variant === 'grid' ? styles.gridThumb : styles.listThumb}
              resizeMode="cover"
              resizeMethod="resize"
            />
          )}
          <View style={styles.cardFooter}>
            {note.pinned && <Text style={styles.pinGlyph}>📌</Text>}
            {note.checklist && note.checklist.length > 0 && (
              <Text style={styles.cardMeta}>
                ☑ {note.checklist.filter((c) => c.done).length}/{note.checklist.length}
              </Text>
            )}
            <Text style={styles.cardMeta}>{date}</Text>
          </View>
        </>
      )}
    </>
  );

  if (variant === 'list') {
    return (
      <Pressable
        onPress={() => onPress(note)}
        onLongPress={() => onLongPress(note)}
        style={[styles.listRow, !last && styles.listDivider]}
      >
        <View style={{ flex: 1 }}>{body}</View>
        {selectMode && <Checkbox checked={checked} />}
      </Pressable>
    );
  }

  return (
    <Animated.View layout={LinearTransition.springify().damping(20).stiffness(180)}>
      <Pressable
        onPress={() => onPress(note)}
        onLongPress={() => onLongPress(note)}
        style={[styles.gridCard, note.locked && styles.lockedCard, checked && styles.cardChecked]}
      >
        {body}
        {selectMode && (
          <View style={styles.gridCheckbox}>
            <Checkbox checked={checked} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

// ── Small UI atoms ───────────────────────────────────────────────────────────
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionHeader({
  label,
  collapsed,
  onToggle,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={[styles.sectionChevron, collapsed && { transform: [{ rotate: '180deg' }] }]}>
        ⌃
      </Text>
    </Pressable>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxOn]}>
      {checked && <Text style={styles.checkboxTick}>✓</Text>}
    </View>
  );
}

function ActionBtn({
  label,
  glyph,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[styles.actionBtn, disabled && { opacity: 0.35 }]}
    >
      <Text style={styles.actionGlyph}>{glyph}</Text>
      <Text style={[styles.actionLabel, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

// Minimal inline glyphs (View primitives) to avoid new icon assets.
function LayoutGlyph({ grid }: { grid: boolean }) {
  return grid ? (
    <View style={styles.glyphRow}>
      <View style={styles.glyphLine} />
      <View style={styles.glyphLine} />
    </View>
  ) : (
    <View>
      <View style={[styles.glyphBar, { marginBottom: 3 }]} />
      <View style={styles.glyphBar} />
    </View>
  );
}
function SelectGlyph() {
  return (
    <View style={styles.selGlyph}>
      <Text style={{ fontSize: 12, color: colors.textPrimary, fontWeight: '800' }}>✓</Text>
    </View>
  );
}
function NotebooksGlyph() {
  return <View style={styles.nbGlyph} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  title: { fontSize: 34, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  selHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  selAction: { fontSize: 16, color: colors.warm, fontWeight: '600' },
  selCount: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary },
  searchClear: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 4 },

  chips: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, alignItems: 'center' },
  chipIcon: {
    width: 40,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: { height: 34, paddingHorizontal: 16, borderRadius: radius.sm, justifyContent: 'center', maxWidth: 180 },
  chipIdle: { backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.textPrimary },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },

  // Sections
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  sectionChevron: { fontSize: 16, color: colors.textMuted, fontWeight: '800' },
  sectionPlain: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  // Grid
  gridRow: { flexDirection: 'row', gap: spacing.md },
  gridCol: { flex: 1, gap: spacing.md },
  gridCard: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...elevation.sm,
  },
  cardChecked: { borderColor: colors.accent, borderWidth: 2 },
  gridThumb: {
    width: '100%',
    height: 96,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  gridCheckbox: { position: 'absolute', top: 8, right: 8 },

  // List
  listWrap: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...elevation.sm,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  listDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(15,15,30,0.08)' },
  listThumb: { width: 54, height: 54, borderRadius: radius.sm, marginTop: spacing.xs, backgroundColor: colors.surfaceAlt },

  cardTitle: { fontSize: fontSize.title, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.2 },
  cardBody: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  cardMeta: { fontSize: fontSize.caption, color: colors.textMuted },
  pinGlyph: { fontSize: 11 },

  // Locked
  lockedCard: { backgroundColor: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.18)' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lockBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,102,241,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.22)',
  },
  lockGlyph: { fontSize: 16 },

  // Checkbox
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxTick: { color: '#fff', fontSize: 13, fontWeight: '900' },

  // FAB
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.warm,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.lg,
  },

  // Action bar
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceStrong,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: { alignItems: 'center', gap: 4, minWidth: 64 },
  actionGlyph: { fontSize: 20 },
  actionLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },

  // Empty
  emptyBox: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyOrb: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(199,210,254,0.45)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyOrbText: { fontSize: 38 },
  emptyTitle: { fontSize: fontSize.title, fontWeight: '700', color: colors.textPrimary },
  emptySub: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 21,
  },

  // Glyphs
  glyphRow: { flexDirection: 'row', gap: 3 },
  glyphLine: { width: 7, height: 16, borderRadius: 2, borderWidth: 1.6, borderColor: colors.textPrimary },
  glyphBar: { width: 17, height: 6, borderRadius: 2, borderWidth: 1.6, borderColor: colors.textPrimary },
  selGlyph: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.6,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nbGlyph: { width: 16, height: 18, borderRadius: 3, borderWidth: 1.8, borderColor: colors.textPrimary },
});
