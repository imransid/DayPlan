import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface SecurityState {
  /** Salted SHA-256 of the app-wide note passcode, or null if none set. */
  passcodeHash: string | null;
  /** Salt used for the hash above. */
  salt: string | null;
}

const initialState: SecurityState = {
  passcodeHash: null,
  salt: null,
};

/**
 * App-wide note-lock passcode. Persisted (see store.ts whitelist) but only ever
 * stores a SALTED HASH — never the passcode itself. The ephemeral "which notes
 * are unlocked right now" state lives in LockContext, not here, because it must
 * reset every time the app is backgrounded and must not be persisted.
 */
const securitySlice = createSlice({
  name: 'security',
  initialState,
  reducers: {
    setPasscode(
      state,
      action: PayloadAction<{ passcodeHash: string; salt: string }>,
    ) {
      state.passcodeHash = action.payload.passcodeHash;
      state.salt = action.payload.salt;
    },
    clearPasscode(state) {
      state.passcodeHash = null;
      state.salt = null;
    },
  },
});

export const { setPasscode, clearPasscode } = securitySlice.actions;
export default securitySlice.reducer;
