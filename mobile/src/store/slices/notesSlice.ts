import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Note, Notebook, NotesViewMode } from '../../types';
import { DEFAULT_NOTEBOOK_ID } from '../../types';

interface NotesState {
  /** Newest-first (active + trashed; the UI filters by `deletedAt`). */
  items: Note[];
  /** User notebooks. The built-in "default" notebook is seeded here. */
  notebooks: Notebook[];
  /** Persisted list layout preference. */
  viewMode: NotesViewMode;
}

const DEFAULT_NOTEBOOK: Notebook = {
  id: DEFAULT_NOTEBOOK_ID,
  name: 'Default notebook',
  createdAt: '1970-01-01T00:00:00.000Z',
};

const initialState: NotesState = {
  items: [],
  notebooks: [DEFAULT_NOTEBOOK],
  viewMode: 'grid',
};

function now(): string {
  return new Date().toISOString();
}

/**
 * Local-first notes store. Persisted via redux-persist (see store.ts whitelist).
 * redux-persist's autoMergeLevel1 seeds `notebooks`/`viewMode` from initialState
 * for users upgrading from the pre-notebooks shape, and notes persisted before
 * these fields existed default via the `?? ` fallbacks in selectors.
 *
 * Reducers stay PURE — soft-deleting flips `deletedAt`, but the on-disk
 * attachment file is only removed when a note is PERMANENTLY deleted, by the
 * caller (file I/O must not happen inside a reducer).
 */
const notesSlice = createSlice({
  name: 'notes',
  initialState,
  reducers: {
    addNote(state, action: PayloadAction<Note>) {
      state.items.unshift({
        notebookId: DEFAULT_NOTEBOOK_ID,
        pinned: false,
        deletedAt: null,
        ...action.payload,
      });
    },
    updateNote(
      state,
      action: PayloadAction<{ id: string; changes: Partial<Omit<Note, 'id' | 'createdAt'>> }>,
    ) {
      const note = state.items.find((n) => n.id === action.payload.id);
      if (!note) return;
      Object.assign(note, action.payload.changes);
      note.updatedAt = now();
    },

    // ── Pin ────────────────────────────────────────────────────────────────
    setNotePinned(state, action: PayloadAction<{ id: string; pinned: boolean }>) {
      const note = state.items.find((n) => n.id === action.payload.id);
      if (note) note.pinned = action.payload.pinned;
    },
    setManyPinned(state, action: PayloadAction<{ ids: string[]; pinned: boolean }>) {
      const set = new Set(action.payload.ids);
      state.items.forEach((n) => {
        if (set.has(n.id)) n.pinned = action.payload.pinned;
      });
    },

    // ── Lock ───────────────────────────────────────────────────────────────
    /**
     * Toggle a note's locked flag. Deliberately does NOT touch `updatedAt` —
     * locking is a security action, not an edit, so it shouldn't bump the
     * "edited X ago" label.
     */
    setNoteLocked(state, action: PayloadAction<{ id: string; locked: boolean }>) {
      const note = state.items.find((n) => n.id === action.payload.id);
      if (note) note.locked = action.payload.locked;
    },
    setManyLocked(state, action: PayloadAction<{ ids: string[]; locked: boolean }>) {
      const set = new Set(action.payload.ids);
      state.items.forEach((n) => {
        if (set.has(n.id)) n.locked = action.payload.locked;
      });
    },

    // ── Notebooks ──────────────────────────────────────────────────────────
    moveNotes(state, action: PayloadAction<{ ids: string[]; notebookId: string }>) {
      const set = new Set(action.payload.ids);
      state.items.forEach((n) => {
        if (set.has(n.id)) {
          n.notebookId = action.payload.notebookId;
          n.updatedAt = now();
        }
      });
    },
    createNotebook(state, action: PayloadAction<{ id: string; name: string }>) {
      const name = action.payload.name.trim();
      if (!name) return;
      state.notebooks.push({ id: action.payload.id, name, createdAt: now() });
    },
    renameNotebook(state, action: PayloadAction<{ id: string; name: string }>) {
      const nb = state.notebooks.find((n) => n.id === action.payload.id);
      const name = action.payload.name.trim();
      if (nb && name) nb.name = name;
    },
    deleteNotebook(state, action: PayloadAction<string>) {
      // Never delete the default notebook. Its notes fall back to default.
      if (action.payload === DEFAULT_NOTEBOOK_ID) return;
      state.notebooks = state.notebooks.filter((n) => n.id !== action.payload);
      state.items.forEach((n) => {
        if (n.notebookId === action.payload) n.notebookId = DEFAULT_NOTEBOOK_ID;
      });
    },

    // ── Soft delete / trash ────────────────────────────────────────────────
    trashNotes(state, action: PayloadAction<string[]>) {
      const set = new Set(action.payload);
      const ts = now();
      state.items.forEach((n) => {
        if (set.has(n.id)) {
          n.deletedAt = ts;
          n.pinned = false; // trashed notes never stay pinned
        }
      });
    },
    restoreNotes(state, action: PayloadAction<string[]>) {
      const set = new Set(action.payload);
      state.items.forEach((n) => {
        if (set.has(n.id)) n.deletedAt = null;
      });
    },
    /** Hard delete — the caller removes any attachment file first. */
    permanentlyDeleteNotes(state, action: PayloadAction<string[]>) {
      const set = new Set(action.payload);
      state.items = state.items.filter((n) => !set.has(n.id));
    },

    setViewMode(state, action: PayloadAction<NotesViewMode>) {
      state.viewMode = action.payload;
    },
  },
});

export const {
  addNote,
  updateNote,
  setNotePinned,
  setManyPinned,
  setNoteLocked,
  setManyLocked,
  moveNotes,
  createNotebook,
  renameNotebook,
  deleteNotebook,
  trashNotes,
  restoreNotes,
  permanentlyDeleteNotes,
  setViewMode,
} = notesSlice.actions;
export default notesSlice.reducer;
