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
  // Only a *true* background→active round-trip counts as a refocus. iOS emits
  // a transient 'inactive' on every control-center pull, notification banner,
  // or app-switcher peek; treating those as focus-lost/refocus caused refetch
  // storms and needless dispatch churn. We track whether we were genuinely
  // backgrounded and only fire onFocus on the way back from that.
  let wasBackground = false;
  const handler = (status: AppStateStatus) => {
    if (status === 'background') {
      wasBackground = true;
      dispatch(actions.onFocusLost());
    } else if (status === 'active') {
      if (wasBackground) dispatch(actions.onFocus());
      wasBackground = false;
    }
    // 'inactive' is intentionally ignored.
  };
  const sub = AppState.addEventListener('change', handler);
  return () => sub.remove();
}
