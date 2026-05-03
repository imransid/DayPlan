import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@/types';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  hasCompletedOnboarding: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  hasCompletedOnboarding: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ accessToken: string; user: User }>) {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
    },
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
    },
    completeOnboarding(state) {
      state.hasCompletedOnboarding = true;
    },
    logout(state) {
      state.accessToken = null;
      state.user = null;
      state.hasCompletedOnboarding = false;
    },
  },
});

export const { setCredentials, setUser, completeOnboarding, logout } = authSlice.actions;
export default authSlice.reducer;
