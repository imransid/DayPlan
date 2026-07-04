import { configureStore, combineReducers } from '@reduxjs/toolkit';
import {
  persistReducer,
  persistStore,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setupListeners } from '@reduxjs/toolkit/query';

import authReducer from './slices/authSlice';
import notesReducer from './slices/notesSlice';
import securityReducer from './slices/securitySlice';
import { api } from './api/api';
import { rnFocusHandler } from './rtkAppStateFocus';

const rootReducer = combineReducers({
  auth: authReducer,
  notes: notesReducer,
  security: securityReducer,
  [api.reducerPath]: api.reducer,
});

const persistConfig = {
  key: 'dayplan-root',
  storage: AsyncStorage,
  // `auth` (session), `notes` (local-first notes + attachment refs) and
  // `security` (salted note-lock passcode hash) persist; the RTK Query API
  // cache rebuilds on launch and is intentionally excluded.
  whitelist: ['auth', 'notes', 'security'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }).concat(api.middleware),
});

export const persistor = persistStore(store);

// Pass the RN AppState handler as setupListeners' custom callback — it receives
// the real onFocus/onFocusLost action creators (see rtkAppStateFocus.ts). This
// is what makes refetchOnFocus work in React Native without crashing.
setupListeners(store.dispatch, rnFocusHandler);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
