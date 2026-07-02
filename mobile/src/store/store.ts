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
import { api } from './api/api';

const rootReducer = combineReducers({
  auth: authReducer,
  notes: notesReducer,
  [api.reducerPath]: api.reducer,
});

const persistConfig = {
  key: 'dayplan-root',
  storage: AsyncStorage,
  // `auth` (session) and `notes` (local-first notes + attachment refs) persist;
  // the RTK Query API cache rebuilds on launch and is intentionally excluded.
  whitelist: ['auth', 'notes'],
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

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
