import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  addProgressListener,
  addStatusListener,
  clearBootInterrupted,
  ensurePermissions,
  getSessionMode,
  getStatus,
  isSupported,
  peekBootInterrupted,
  pauseRoute as pauseRouteNative,
  resumeRoute as resumeRouteNative,
  start as startNative,
  startRoute as startRouteNative,
  stop as stopNative,
  update as updateNative,
  type MockActionResult,
  type MockLocationTarget,
  type MockRouteProgress,
  type MockRouteTarget,
  type MockSessionMode,
  type MockStatus,
  type PermissionResult,
} from '../services/mockLocation';
import {
  loadMockLocationState,
  saveMockLocationState,
  type MockLocationState,
  type SavedPlace,
} from '../services/mockLocationStorage';

/**
 * Drives the mock-location screen.
 *
 * `status` is null until the first native read resolves. That's deliberate:
 * every non-null value renders a specific banner, and guessing one for a few
 * frames means flashing "set DayPlan as your mock location app" at people who
 * already have. Render a spinner while it's null.
 */
export interface UseMockLocation {
  status: MockStatus | null;
  /** Last error the native layer reported, cleared on the next good transition. */
  error: string | null;
  /** The target currently selected — not necessarily the one being injected. */
  current: MockLocationTarget | null;
  isRunning: boolean;
  isSupported: boolean;
  /** True while a reboot-ended session still needs acknowledging. */
  bootInterrupted: boolean;
  places: SavedPlace[];
  /** Live route telemetry, or null when no route is running. */
  progress: MockRouteProgress | null;
  /** Which kind of session is live, so the UI can open on the matching tab. */
  sessionMode: MockSessionMode;
  /**
   * Which permission the user has permanently blocked, if we've found out.
   * Null means "not blocked, or we haven't asked yet" — and those two are the
   * same as far as the UI goes: prompt, and let the outcome tell us.
   * PermissionsAndroid gives no way to know in advance.
   */
  permissionBlocked: 'location' | 'notifications' | null;

  /** Fires the runtime prompts. The banner's default action on first run. */
  requestPermissions: () => Promise<PermissionResult>;
  start: (target?: MockLocationTarget) => Promise<MockActionResult>;
  startRoute: (target: MockRouteTarget) => Promise<MockActionResult>;
  pauseRoute: () => Promise<MockActionResult>;
  resumeRoute: () => Promise<MockActionResult>;
  stop: () => Promise<MockActionResult>;
  /** Select a target; live-updates the running session if there is one. */
  setLocation: (target: MockLocationTarget) => Promise<MockActionResult>;
  refresh: () => Promise<MockStatus>;
  dismissBootInterrupted: () => void;
  savePlaces: (places: SavedPlace[]) => void;
}

export function useMockLocation(): UseMockLocation {
  const [status, setStatus] = useState<MockStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<MockLocationTarget | null>(null);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [bootInterrupted, setBootInterrupted] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState<
    'location' | 'notifications' | null
  >(null);
  const [progress, setProgress] = useState<MockRouteProgress | null>(null);
  const [sessionMode, setSessionMode] = useState<MockSessionMode>('NONE');

  // Guards setState after unmount for the async bootstrap below.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<MockStatus> => {
    // Read together: a status of RUNNING is only actionable alongside knowing
    // which kind of session it is.
    const [next, nextMode] = await Promise.all([getStatus(), getSessionMode()]);
    if (mounted.current) {
      setStatus(next);
      setSessionMode(nextMode);
    }
    return next;
  }, []);

  // Restore saved places / last target, and pick up a reboot-interrupted flag.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stored] = await Promise.all([loadMockLocationState(), refresh()]);
      if (cancelled || !mounted.current) return;
      stateRef.current = stored;
      setPlaces(stored.places);
      setCurrent(stored.last);

      // Peek only. The flag stays set natively until the user acknowledges it,
      // so unmounting mid-flight (fast back-navigation) can't swallow it.
      if (isSupported && (await peekBootInterrupted())) {
        if (!cancelled && mounted.current) setBootInterrupted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Native status changes (session stopped itself, app op revoked mid-run…).
  useEffect(
    () =>
      addStatusListener((event) => {
        if (!mounted.current) return;
        setStatus(event.status);
        setError(event.error ?? null);
      }),
    [],
  );

  // Route telemetry, roughly once a second while a route runs.
  useEffect(
    () =>
      addProgressListener((next) => {
        if (mounted.current) setProgress(next);
      }),
    [],
  );

  // Re-read on foreground: the two things that most often change status —
  // toggling the mock location app and granting a permission — both happen in
  // system screens, so we come back not knowing what the user did.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  /**
   * The authoritative copy of what's on disk.
   *
   * Persisting from component state doesn't work here: savePlaces and
   * setLocation would each write a whole {places, last} object built from its
   * own render's closure, so two calls in the same tick overwrite each other's
   * field. Every write goes through this ref instead, which also keeps `places`
   * and `current` out of the callbacks' dependency arrays.
   */
  const stateRef = useRef<MockLocationState>({ places: [], last: null });

  const persist = useCallback((patch: Partial<MockLocationState>) => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    void saveMockLocationState(next);
    return next;
  }, []);

  const savePlaces = useCallback(
    (next: SavedPlace[]) => {
      setPlaces(next);
      persist({ places: next });
    },
    [persist],
  );

  const setLocation = useCallback(
    async (target: MockLocationTarget): Promise<MockActionResult> => {
      setCurrent(target);
      persist({ last: target });

      // Only push to native if something is actually running; otherwise this is
      // just a selection and start() will carry it.
      if (status !== 'RUNNING') return { ok: true };

      const result = await updateNative(target);
      if (!result.ok && mounted.current) setError(result.message);
      return result;
    },
    [persist, status],
  );

  const start = useCallback(
    async (target?: MockLocationTarget): Promise<MockActionResult> => {
      // Read the fallback from the ref, not from `current`: same single source
      // of truth, and it keeps this callback stable across selection changes.
      const chosen = target ?? stateRef.current.last;
      if (!chosen) {
        return {
          ok: false,
          code: 'E_MOCK_INVALID_OPTIONS',
          message: 'Pick a location first.',
        };
      }

      setError(null);
      if (target) {
        setCurrent(target);
        persist({ last: target });
      }

      const result = await startNative(chosen);
      if (!mounted.current) return result;

      if (result.ok) {
        // A new session makes the "a reboot stopped you" notice moot.
        setBootInterrupted(false);
        void clearBootInterrupted();
        // The native RUNNING event usually beats us here, but a status read
        // costs nothing and keeps the button honest if it doesn't.
        void refresh();
      } else {
        if (
          result.code === 'E_MOCK_PERMISSION' ||
          result.code === 'E_MOCK_NOTIFICATIONS'
        ) {
          setPermissionBlocked(
            result.blockedPermanently === true
              ? result.code === 'E_MOCK_NOTIFICATIONS'
                ? 'notifications'
                : 'location'
              : null,
          );
        }
        setError(result.message);
        // Failure reasons map onto statuses (NOT_SELECTED, PERMISSION_MISSING),
        // so resync rather than inferring which banner to show.
        void refresh();
      }
      return result;
    },
    [persist, refresh],
  );

  const startRoute = useCallback(
    async (target: MockRouteTarget): Promise<MockActionResult> => {
      setError(null);
      setProgress(null);
      const result = await startRouteNative(target);
      if (!mounted.current) return result;
      if (result.ok) {
        setBootInterrupted(false);
        void clearBootInterrupted();
      } else {
        setError(result.message);
        if (
          result.code === 'E_MOCK_PERMISSION' ||
          result.code === 'E_MOCK_NOTIFICATIONS'
        ) {
          setPermissionBlocked(
            result.blockedPermanently === true
              ? result.code === 'E_MOCK_NOTIFICATIONS'
                ? 'notifications'
                : 'location'
              : null,
          );
        }
      }
      void refresh();
      return result;
    },
    [refresh],
  );

  const pauseRoute = useCallback(async (): Promise<MockActionResult> => {
    const result = await pauseRouteNative();
    if (!result.ok && mounted.current) setError(result.message);
    return result;
  }, []);

  const resumeRoute = useCallback(async (): Promise<MockActionResult> => {
    const result = await resumeRouteNative();
    if (!result.ok && mounted.current) setError(result.message);
    return result;
  }, []);

  const stop = useCallback(async (): Promise<MockActionResult> => {
    const result = await stopNative();
    if (!mounted.current) return result;
    if (!result.ok) setError(result.message);
    setProgress(null);
    void refresh();
    return result;
  }, [refresh]);

  /** Acknowledged — only now is it safe to clear the native flag. */
  const dismissBootInterrupted = useCallback(() => {
    setBootInterrupted(false);
    void clearBootInterrupted();
  }, []);

  const requestPermissions = useCallback(async (): Promise<PermissionResult> => {
    const result = await ensurePermissions();
    if (!mounted.current) return result;
    setPermissionBlocked(
      result.granted || !result.blockedPermanently ? null : result.permission,
    );
    void refresh();
    return result;
  }, [refresh]);

  return {
    status,
    error,
    current,
    isRunning: status === 'RUNNING',
    isSupported,
    bootInterrupted,
    places,
    progress,
    sessionMode,
    permissionBlocked,
    requestPermissions,
    start,
    startRoute,
    pauseRoute,
    resumeRoute,
    stop,
    setLocation,
    refresh,
    dismissBootInterrupted,
    savePlaces,
  };
}
