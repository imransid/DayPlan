import { AppState, type AppStateStatus } from 'react-native';

/**
 * Custom `setupListeners` handler for React Native.
 *
 * RTK Query's focus/online action creators (onFocus/onFocusLost/…) are NOT
 * importable from '@reduxjs/toolkit/query' — they resolve to `undefined`, so
 * dispatching them crashes the app on every foreground/background change.
 * Instead, `setupListeners(dispatch, handler)` passes the action creators into
 * this handler. We map React Native's AppState (which has no window focus/blur
 * event) to onFocus/onFocusLost so `refetchOnFocus` works.
 *
 * Signature intentionally matches setupListeners' 2nd argument.
 */
export function rnFocusHandler(
  dispatch: (action: unknown) => unknown,
  actions: {
    onFocus: () => unknown;
    onFocusLost: () => unknown;
    onOnline: () => unknown;
    onOffline: () => unknown;
  },
): () => void {
  const handler = (status: AppStateStatus) => {
    if (status === 'active') {
      dispatch(actions.onFocus());
    } else if (status === 'background' || status === 'inactive') {
      dispatch(actions.onFocusLost());
    }
  };
  const sub = AppState.addEventListener('change', handler);
  return () => sub.remove();
}
