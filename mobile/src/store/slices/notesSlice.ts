import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Note } from '../../types';

interface NotesState {
  /** Newest-first. */
  items: Note[];
}

const initialState: NotesState = {
  items: [],
};

/**
 * Local-first notes store. Persisted via redux-persist (see store.ts whitelist).
 *
 * Reducers stay PURE — deleting a note removes it from state here, but the
 * on-disk attachment file is cleaned up by the caller (NoteEditorScreen) via
 * `attachmentStorage.removeAttachment`, since file I/O must not happen inside a
 * reducer.
 */
const notesSlice = createSlice({
  name: 'notes',
  initialState,
  reducers: {
    addNote(state, action: PayloadAction<Note>) {
      state.items.unshift(action.payload);
    },
    updateNote(
      state,
      action: PayloadAction<{ id: string; changes: Partial<Omit<Note, 'id' | 'createdAt'>> }>,
    ) {
      const note = state.items.find((n) => n.id === action.payload.id);
      if (!note) return;
      Object.assign(note, action.payload.changes);
      note.updatedAt = new Date().toISOString();
    },
    deleteNote(state, action: PayloadAction<string>) {
      state.items = state.items.filter((n) => n.id !== action.payload);
    },
  },
});

export const { addNote, updateNote, deleteNote } = notesSlice.actions;
export default notesSlice.reducer;
