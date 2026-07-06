import {
  configureStore,
  combineReducers,
  createListenerMiddleware,
  isAnyOf,
  type Middleware,
} from '@reduxjs/toolkit';
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

import authReducer, { logout } from './slices/authSlice';
import notesReducer from './slices/notesSlice';
import securityReducer from './slices/securitySlice';
import { api } from './api/api';
import { rnFocusHandler } from './rtkAppStateFocus';
import { cancelAutoPosts, saveAutoPostConfig } from '../services/scheduledPosts';
import { cancelHourlyAlarms } from '../services/notifications';
import { saveAlarmConfig } from '../services/alarmStorage';

const rootReducer = combineReducers({
  auth: authReducer,
  notes: notesReducer,
  security: securityReducer,
  [api.reducerPath]: api.reducer,
});

const persistConfig = {
  key: 'dayplan-root',
  storage: AsyncStorage,
  // NOTE: redux-persist's default reconciler (autoMergeLevel1) REPLACES each
  // whole slice with the persisted shape, so a slice field added later (e.g.
  // notes.notebooks / notes.viewMode) is `undefined` for users who persisted
  // before it existed. That's handled WITHOUT a custom reconciler: the notebook
  // reducers guard/seed the default (notesSlice) and the read paths fall back to
  // `[DEFAULT_NOTEBOOK]` / 'grid'. This keeps store typings intact.
  //
  // `auth` (session), `notes` (local-first notes + attachment refs) and
  // `security` (salted note-lock passcode hash) persist; the RTK Query API
  // cache rebuilds on launch and is intentionally excluded.
  whitelist: ['auth', 'notes', 'security'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

/**
 * On sign-out (manual OR the 401 auto-logout in api.ts, which both dispatch
 * `auth/logout`), tear down anything that could act on the NEXT account signed
 * in on this device: cancel the OS-held scheduled Discord posts + hourly alarms
 * (they survive logout and would otherwise fire using the new user's token),
 * reset their on-device configs, and drop the previous user's RTK Query cache.
 */
const authTeardown = createListenerMiddleware();
authTeardown.startListening({
  matcher: isAnyOf(logout),
  effect: async (_action, listenerApi) => {
    listenerApi.dispatch(api.util.resetApiState());
    await Promise.allSettled([
      cancelAutoPosts(),
      cancelHourlyAlarms(),
      saveAutoPostConfig({ enabled: false }),
      saveAlarmConfig({ enabled: false }),
    ]);
  },
});

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    })
      // Cast to a plain Middleware: the listener middleware's default `unknown`
      // state generic otherwise poisons configureStore's state inference (which
      // would make RootState resolve to just PersistPartial). Runtime behaviour
      // is unaffected.
      .prepend(authTeardown.middleware as Middleware)
      .concat(api.middleware),
});

export const persistor = persistStore(store);

// Pass the RN AppState handler as setupListeners' custom callback — it receives
// the real onFocus/onFocusLost action creators (see rtkAppStateFocus.ts). This
// is what makes refetchOnFocus work in React Native without crashing.
setupListeners(store.dispatch, rnFocusHandler);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
