import { AppState, type AppStateStatus } from 'react-native';
import { onFocus, onFocusLost } from '@reduxjs/toolkit/query';
import type { AppDispatch } from './store';

/**
 * RTK Query's `refetchOnFocus` relies on browser `window.focus`/`blur` events,
 * which don't exist in React Native — so `setupListeners(dispatch)` alone is a
 * no-op here. This adapter maps React Native's `AppState` (foreground/background)
 * to RTK Query's `onFocus`/`onFocusLost` actions, so active queries silently
 * refetch when the user returns to the app.
 */
export function setupRnFocusListeners(dispatch: AppDispatch): () => void {
  let prev: AppStateStatus = AppState.currentState;
  const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
    const wasBackground = prev === 'inactive' || prev === 'background';
    if (wasBackground && next === 'active') {
      dispatch(onFocus());
    } else if (next === 'inactive' || next === 'background') {
      dispatch(onFocusLost());
    }
    prev = next;
  });
  return () => sub.remove();
}
