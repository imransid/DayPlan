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
import { ChevronLeftIcon, PlusIcon } from '../../components/Icon';
import { AttachmentPreview } from '../../components/AttachmentPreview';
import { MarkdownText } from '../../components/MarkdownText';
import { SpreadsheetEditor } from '../../components/SpreadsheetEditor';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { PasscodeModal } from '../../components/PasscodeModal';
import { AppModal } from '../../components/AppModal';
import { colors, spacing, radius, fontSize, elevation } from '../../theme';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  addNote,
  updateNote,
  trashNotes,
  setNoteLocked,
  setNotePinned,
} from '../../store/slices/notesSlice';
import { removeAttachment } from '../../services/attachmentStorage';
import { useAttachmentPicker } from '../../hooks/useAttachmentPicker';
import { useLock } from '../../context/LockContext';
import { DEFAULT_NOTEBOOK_ID } from '../../types';
import type { MainStackParamList } from '../../navigation/types';
import type { Note, NoteAttachment, ChecklistItem } from '../../types';

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
  const { pickMedia, pickCamera, pickFile, isBusy } = useAttachmentPicker();

  const noteId = route.params?.noteId;
  const existing = useAppSelector((s) =>
    noteId ? s.notes.items.find((n) => n.id === noteId) : undefined,
  );

  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [attachment, setAttachment] = useState<NoteAttachment | null>(existing?.attachment ?? null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(existing?.checklist ?? []);
  const [sheet, setSheet] = useState<string[][] | null>(existing?.sheet ?? null);
  // Bottom sheets: "+ Add" (media/checklist) and the ⋮ overflow (pin/lock/delete).
  const [addSheet, setAddSheet] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Lock state ──────────────────────────────────────────────────────────
  const { hasPasscode, isUnlocked, unlock, verifyPasscode, setPasscode } = useLock();
  const isLocked = !!existing?.locked;
  // A note is gated when it's locked, not unlocked this session, AND an app
  // passcode actually exists. Without the hasPasscode guard, a note left locked
  // after the passcode was cleared would be gated forever with no way to unlock
  // (verifyPasscode always fails when there's no stored hash).
  const gated = !!existing && isLocked && hasPasscode && !isUnlocked(existing.id);
  // Passcode modal: 'enter' to open a gated note, 'set' to create the app
  // passcode when locking the first note.
  const [passcodeMode, setPasscodeMode] = useState<'enter' | 'set' | null>(null);
  // A brand-new (unsaved) note has no id to lock yet, so we record the INTENT
  // to lock and apply it on save. For an existing note the source of truth is
  // the persisted `locked` flag.
  const [pendingLock, setPendingLock] = useState(false);
  // For a brand-new note, the first-ever app passcode is captured here and only
  // committed to the (persisted) securitySlice when the note is actually saved
  // — so abandoning the note doesn't leave a global passcode set forever.
  const [pendingPasscode, setPendingPasscode] = useState<string | null>(null);
  const showLocked = existing ? isLocked : pendingLock;

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

  // The Doodle screen returns its rasterised drawing by merging a
  // `doodleAttachment` param onto this route. Apply it, then clear the param so
  // it isn't re-applied on a later re-render.
  useEffect(() => {
    const doodle = route.params?.doodleAttachment;
    if (doodle) {
      applyPicked(doodle);
      navigation.setParams({ doodleAttachment: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.doodleAttachment]);

  // ── Checklist ─────────────────────────────────────────────────────────────
  const cid = () => `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const addChecklistItem = () =>
    setChecklist((l) => [...l, { id: cid(), text: '', done: false }]);
  const toggleChecklistItem = (id: string) =>
    setChecklist((l) => l.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));
  const updateChecklistItem = (id: string, text: string) =>
    setChecklist((l) => l.map((c) => (c.id === id ? { ...c, text } : c)));
  const removeChecklistItem = (id: string) =>
    setChecklist((l) => l.filter((c) => c.id !== id));

  const cleanedChecklist = checklist.filter((c) => c.text.trim().length > 0);
  // Keep the sheet only if any cell has content.
  const cleanedSheet =
    sheet && sheet.some((row) => row.some((cell) => cell.trim().length > 0)) ? sheet : null;
  const canSave =
    title.trim().length > 0 ||
    body.trim().length > 0 ||
    attachment !== null ||
    cleanedChecklist.length > 0 ||
    cleanedSheet !== null;

  // ── Undo / redo (title + body text history) ───────────────────────────────
  // A debounced snapshot stack: typing coalesces into word-level steps, undo/
  // redo walk the stack. `restoring` prevents an applied snapshot from being
  // re-recorded; `bumpHist` re-renders so the arrow enabled-state updates.
  const latest = useRef({ title: existing?.title ?? '', body: existing?.body ?? '' });
  const history = useRef<Array<{ title: string; body: string }>>([
    { title: existing?.title ?? '', body: existing?.body ?? '' },
  ]);
  const histIndex = useRef(0);
  const restoring = useRef(false);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, bumpHist] = useState(0);

  const pushSnapshot = () => {
    const top = history.current[histIndex.current];
    const { title: t, body: b } = latest.current;
    if (top && top.title === t && top.body === b) return;
    history.current = history.current.slice(0, histIndex.current + 1);
    history.current.push({ title: t, body: b });
    if (history.current.length > 100) history.current.shift(); // cap growth
    histIndex.current = history.current.length - 1;
    bumpHist((v) => v + 1);
  };

  const scheduleSnapshot = () => {
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(pushSnapshot, 350);
  };

  useEffect(
    () => () => {
      if (snapTimer.current) clearTimeout(snapTimer.current);
    },
    [],
  );

  const handleTitleChange = (v: string) => {
    setTitle(v);
    latest.current = { ...latest.current, title: v };
    if (!restoring.current) scheduleSnapshot();
  };
  const handleBodyChange = (v: string) => {
    setBody(v);
    latest.current = { ...latest.current, body: v };
    if (!restoring.current) scheduleSnapshot();
  };

  const applySnapshot = (i: number) => {
    const snap = history.current[i];
    if (!snap) return;
    restoring.current = true;
    setTitle(snap.title);
    setBody(snap.body);
    latest.current = { ...snap };
    histIndex.current = i;
    setTimeout(() => {
      restoring.current = false;
    }, 0);
    bumpHist((v) => v + 1);
  };

  const canUndo = histIndex.current > 0;
  const canRedo = histIndex.current < history.current.length - 1;
  const onUndo = () => {
    // Flush any pending debounced edit first so it becomes an undoable step.
    if (snapTimer.current) {
      clearTimeout(snapTimer.current);
      snapTimer.current = null;
      pushSnapshot();
    }
    if (histIndex.current > 0) applySnapshot(histIndex.current - 1);
  };
  const onRedo = () => {
    if (histIndex.current < history.current.length - 1) {
      applySnapshot(histIndex.current + 1);
    }
  };

  // ── Rich text (markdown) ──────────────────────────────────────────────────
  // The "Aa" toolbar writes markdown into the plain-text body; a preview toggle
  // renders it via MarkdownText. Keeping the body as plain markdown means
  // search / checklist / card previews are unaffected.
  const bodyRef = useRef<TextInput>(null);
  const bodySel = useRef({ start: 0, end: 0 });
  const [previewMode, setPreviewMode] = useState(false);

  const applyWrap = (marker: string) => {
    const s = Math.min(bodySel.current.start, body.length);
    const e = Math.min(bodySel.current.end, body.length);
    const sel = body.slice(s, e) || 'text';
    handleBodyChange(`${body.slice(0, s)}${marker}${sel}${marker}${body.slice(e)}`);
    requestAnimationFrame(() => bodyRef.current?.focus());
  };
  const applyLinePrefix = (prefix: string) => {
    const s = Math.min(bodySel.current.start, body.length);
    const lineStart = body.lastIndexOf('\n', s - 1) + 1;
    handleBodyChange(`${body.slice(0, lineStart)}${prefix}${body.slice(lineStart)}`);
    requestAnimationFrame(() => bodyRef.current?.focus());
  };

  const onSave = async () => {
    // Re-entry guard: `savedRef` is a ref (no re-render), so a fast double-tap
    // on Done could otherwise run onSave twice and create two notes.
    if (!canSave || savedRef.current) return;
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
      dispatch(
        updateNote({
          id: existing.id,
          changes: {
            title,
            body,
            attachment,
            checklist: cleanedChecklist,
            sheet: cleanedSheet ?? undefined,
          },
        }),
      );
    } else {
      // Commit a deferred first-ever passcode now that the note is being saved.
      if (pendingLock && pendingPasscode) setPasscode(pendingPasscode);
      const now = new Date().toISOString();
      const id = newId();
      const note: Note = {
        id,
        title,
        body,
        createdAt: now,
        updatedAt: now,
        attachment,
        checklist: cleanedChecklist,
        sheet: cleanedSheet ?? undefined,
        locked: pendingLock,
        notebookId: route.params?.notebookId ?? DEFAULT_NOTEBOOK_ID,
      };
      dispatch(addNote(note));
      // Keep it viewable this session for the user who just created it.
      if (pendingLock) unlock(id);
    }
    navigation.goBack();
  };

  const onDelete = () => {
    if (!existing) return;
    Alert.alert('Delete note?', 'Moved to Recently deleted for 30 days.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          savedRef.current = true;
          // Soft delete — the note (and its saved attachment) is kept so it can
          // be restored. Only clean up files picked in THIS session that were
          // never persisted; the note's original attachment stays for restore.
          await Promise.allSettled(pickedPaths.current.map((p) => removeAttachment(p)));
          dispatch(trashNotes([existing.id]));
          navigation.goBack();
        },
      },
    ]);
  };

  const onTogglePin = () => {
    if (!existing) return;
    dispatch(setNotePinned({ id: existing.id, pinned: !existing.pinned }));
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
      // New note: toggle the intent to lock. It's applied when the note is
      // saved. Creating the app passcode first if there isn't one yet.
      if (pendingLock) {
        setPendingLock(false);
        return;
      }
      if (hasPasscode) {
        setPendingLock(true);
      } else {
        setPasscodeMode('set');
      }
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
      if (existing) {
        // First-ever passcode → commit it now and lock this saved note.
        setPasscode(passcode);
        dispatch(setNoteLocked({ id: existing.id, locked: true }));
        unlock(existing.id);
      } else {
        // New note: defer BOTH the passcode and the lock until the note is
        // actually saved (see onSave), so abandoning it leaves no global
        // passcode behind.
        setPendingPasscode(passcode);
        setPendingLock(true);
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
          {!gated && (
            <>
              <PressScale
                onPress={onUndo}
                disabled={!canUndo}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Undo"
              >
                <Text style={[styles.undoGlyph, !canUndo && styles.undoDisabled]}>↶</Text>
              </PressScale>
              <PressScale
                onPress={onRedo}
                disabled={!canRedo}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Redo"
              >
                <Text style={[styles.undoGlyph, !canRedo && styles.undoDisabled]}>↷</Text>
              </PressScale>
            </>
          )}
          <View style={{ flex: 1 }} />
          {gated ? (
            // While a locked note is still gated, the passcode prompt is the
            // only affordance — hide the controls so the lock can't be removed
            // without first unlocking.
            <View style={styles.iconBtn} />
          ) : (
            <View style={styles.headerActions}>
              {/* Pin/Lock/Delete moved into a ⋮ overflow to declutter the bar. */}
              <PressScale
                onPress={() => setMenuOpen(true)}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="More options"
              >
                <Text style={styles.moreGlyph}>⋮</Text>
              </PressScale>
              <PressScale
                onPress={onSave}
                disabled={!canSave}
                style={[styles.doneBtn, !canSave && { opacity: 0.4 }]}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.doneText}>Done</Text>
              </PressScale>
            </View>
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
            onChangeText={handleTitleChange}
            placeholder="Title"
            placeholderTextColor={colors.textMuted}
            style={styles.titleInput}
            maxLength={120}
          />

          {previewMode ? (
            <Pressable
              onPress={() => setPreviewMode(false)}
              style={styles.previewBox}
              accessibilityLabel="Edit note"
            >
              {body.trim() ? (
                <MarkdownText text={body} />
              ) : (
                <Text style={styles.previewEmpty}>Nothing to preview — tap to edit.</Text>
              )}
            </Pressable>
          ) : (
            <>
              <TextInput
                ref={bodyRef}
                value={body}
                onChangeText={handleBodyChange}
                onSelectionChange={(e) => {
                  bodySel.current = e.nativeEvent.selection;
                }}
                placeholder="Write your note…"
                placeholderTextColor={colors.textMuted}
                style={styles.bodyInput}
                multiline
                textAlignVertical="top"
              />
              {/* "Aa" formatting toolbar — writes markdown into the body. */}
              <View style={styles.fmtBar}>
                <Pressable onPress={() => setPreviewMode(true)} style={styles.fmtBtn}>
                  <Text style={styles.fmtPreview}>Aa Preview</Text>
                </Pressable>
                <View style={styles.fmtSpacer} />
                <Pressable onPress={() => applyWrap('**')} style={styles.fmtBtn}>
                  <Text style={[styles.fmtGlyph, { fontWeight: '800' }]}>B</Text>
                </Pressable>
                <Pressable onPress={() => applyWrap('_')} style={styles.fmtBtn}>
                  <Text style={[styles.fmtGlyph, { fontStyle: 'italic' }]}>I</Text>
                </Pressable>
                <Pressable onPress={() => applyLinePrefix('# ')} style={styles.fmtBtn}>
                  <Text style={styles.fmtGlyph}>H</Text>
                </Pressable>
                <Pressable onPress={() => applyLinePrefix('- ')} style={styles.fmtBtn}>
                  <Text style={styles.fmtGlyph}>•</Text>
                </Pressable>
              </View>
            </>
          )}

          {attachment && (
            <View style={{ marginTop: spacing.lg }}>
              {/* Contain any render-time crash in the media subtree (Image /
                  Video / Modal) so a bad attachment degrades to a placeholder
                  instead of tearing down the whole editor. */}
              <ErrorBoundary
                fallback={
                  <View style={styles.attachError}>
                    <Text style={styles.attachErrorText}>Couldn’t preview this attachment</Text>
                    <Button
                      label="Remove"
                      variant="outline"
                      fullWidth={false}
                      onPress={() => setAttachment(null)}
                    />
                  </View>
                }
              >
                <AttachmentPreview attachment={attachment} onRemove={() => setAttachment(null)} />
              </ErrorBoundary>
            </View>
          )}

          {checklist.length > 0 && (
            <View style={styles.checklist}>
              {checklist.map((item) => (
                <View key={item.id} style={styles.checkRow}>
                  <Pressable
                    onPress={() => toggleChecklistItem(item.id)}
                    style={[styles.checkbox, item.done && styles.checkboxOn]}
                    hitSlop={6}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.done }}
                  >
                    {item.done && <Text style={styles.checkTick}>✓</Text>}
                  </Pressable>
                  <TextInput
                    value={item.text}
                    onChangeText={(t) => updateChecklistItem(item.id, t)}
                    placeholder="List item"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.checkInput, item.done && styles.checkInputDone]}
                    onSubmitEditing={addChecklistItem}
                    blurOnSubmit={false}
                    returnKeyType="next"
                  />
                  <Pressable onPress={() => removeChecklistItem(item.id)} hitSlop={6}>
                    <Text style={styles.checkRemove}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable onPress={addChecklistItem} style={styles.checkAdd}>
                <Text style={styles.checkAddText}>+ Add item</Text>
              </Pressable>
            </View>
          )}

          {sheet && (
            <SpreadsheetEditor value={sheet} onChange={setSheet} onRemove={() => setSheet(null)} />
          )}

          <Pressable
            onPress={() => setAddSheet(true)}
            style={styles.addRow}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Add attachment or checklist"
          >
            <PlusIcon size={18} color={colors.accent} weight={2.4} />
            <Text style={styles.addRowText}>
              {isBusy ? 'Adding…' : 'Add photo, file or checklist'}
            </Text>
          </Pressable>
        </ScrollView>
          </>
        )}

        {/* "+ Add" sheet — Photos / Camera / Files / Checklist */}
        <AppModal
          visible={addSheet}
          onClose={() => setAddSheet(false)}
          variant="sheet"
          contentStyle={styles.sheet}
        >
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Add</Text>
          <View style={styles.addGrid}>
            <AddTile
              emoji="🖼️"
              label="Photos"
              onPress={async () => {
                setAddSheet(false);
                applyPicked(await pickMedia());
              }}
            />
            <AddTile
              emoji="📷"
              label="Camera"
              onPress={async () => {
                setAddSheet(false);
                applyPicked(await pickCamera());
              }}
            />
            <AddTile
              emoji="✏️"
              label="Doodle"
              onPress={() => {
                setAddSheet(false);
                navigation.navigate('Doodle');
              }}
            />
            <AddTile
              emoji="✅"
              label="Checklist"
              onPress={() => {
                setAddSheet(false);
                if (checklist.length === 0) addChecklistItem();
              }}
            />
            <AddTile
              emoji="📊"
              label="Sheet"
              onPress={() => {
                setAddSheet(false);
                if (!sheet) {
                  setSheet([
                    ['', '', ''],
                    ['', '', ''],
                    ['', '', ''],
                  ]);
                }
              }}
            />
            <AddTile
              emoji="📎"
              label="Files"
              onPress={async () => {
                setAddSheet(false);
                applyPicked(await pickFile());
              }}
            />
          </View>
        </AppModal>

        {/* ⋮ overflow — Pin / Lock / Delete */}
        <AppModal
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          variant="sheet"
          contentStyle={styles.sheet}
        >
          <View style={styles.grabber} />
          {existing && (
            <MenuRow
              emoji="📌"
              label={existing.pinned ? 'Unpin' : 'Pin'}
              onPress={() => {
                setMenuOpen(false);
                onTogglePin();
              }}
            />
          )}
          <MenuRow
            emoji={showLocked ? '🔒' : '🔓'}
            label={showLocked ? 'Remove lock' : 'Lock note'}
            onPress={() => {
              setMenuOpen(false);
              onToggleLock();
            }}
          />
          {existing && (
            <MenuRow
              emoji="🗑️"
              label="Delete"
              danger
              onPress={() => {
                setMenuOpen(false);
                onDelete();
              }}
            />
          )}
        </AppModal>

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

function AddTile({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress} style={styles.addTile} scaleTo={0.95}>
      <View style={styles.addTileIcon}>
        <Text style={styles.addTileEmoji}>{emoji}</Text>
      </View>
      <Text style={styles.addTileLabel}>{label}</Text>
    </PressScale>
  );
}

function MenuRow({
  emoji,
  label,
  onPress,
  danger,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <PressScale onPress={onPress} style={styles.menuRow} scaleTo={0.99}>
      <Text style={styles.menuEmoji}>{emoji}</Text>
      <Text style={[styles.menuLabel, danger && { color: colors.danger }]}>{label}</Text>
    </PressScale>
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
  moreGlyph: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  undoGlyph: { fontSize: 24, color: colors.textPrimary, fontWeight: '500' },
  undoDisabled: { color: colors.textDisabled },
  doneBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  doneText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── "+ Add" row + sheet ──
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(99, 102, 241, 0.35)',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  addRowText: { fontSize: fontSize.body, color: colors.accent, fontWeight: '700' },
  sheet: {
    backgroundColor: colors.surfaceStrong,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.borderStrong,
    ...elevation.lg,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textDisabled,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  addGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg, columnGap: spacing.sm },
  addTile: { width: '30%', alignItems: 'center', gap: 6, paddingVertical: spacing.sm },
  addTileIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTileEmoji: { fontSize: 26 },
  addTileLabel: { fontSize: fontSize.small, color: colors.textSecondary, fontWeight: '600' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 15,
  },
  menuEmoji: { fontSize: 20 },
  menuLabel: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },

  // ── Checklist ──
  checklist: { marginTop: spacing.lg, gap: spacing.xs },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkTick: { color: '#fff', fontSize: 13, fontWeight: '900' },
  checkInput: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, paddingVertical: 8 },
  checkInputDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  checkRemove: { fontSize: 15, color: colors.textMuted, paddingHorizontal: 4 },
  checkAdd: { paddingVertical: 10, paddingLeft: 34 },
  checkAddText: { fontSize: fontSize.body, color: colors.accent, fontWeight: '600' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  lockBtnLabel: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
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
  // ── Rich-text (markdown) toolbar + preview ──
  fmtBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  fmtSpacer: { flex: 1 },
  fmtBtn: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fmtGlyph: { fontSize: 17, color: colors.textPrimary },
  fmtPreview: { fontSize: fontSize.small, fontWeight: '700', color: colors.accent },
  previewBox: { minHeight: 180, paddingVertical: spacing.sm },
  previewEmpty: { fontSize: fontSize.body, color: colors.textMuted },
  attachRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  attachBtn: { flex: 1 },
  attachError: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  attachErrorText: { fontSize: fontSize.body, color: colors.textMuted, fontWeight: '600' },
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
