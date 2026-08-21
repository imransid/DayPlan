import {
  NativeEventEmitter,
  PermissionsAndroid,
  Platform,
  type NativeModule,
} from 'react-native';

import NativeMockLocation, {
  type MockLocationOptions,
  type RouteOptions,
} from '../../specs/NativeMockLocation';

/**
 * Typed JS surface over the Android mock-location TurboModule.
 *
 * Everything here is a safe no-op off Android: the spec is resolved with
 * TurboModuleRegistry.get (not getEnforcing), so `NativeMockLocation` is simply
 * null on iOS and every call below short-circuits to UNSUPPORTED rather than
 * throwing. Nothing in this file assumes the native side exists.
 *
 * See mobile/docs/mock-location.md for what the native layer actually does.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type MockStatus =
  /** Not Android — there is no system-wide equivalent without a jailbreak. */
  | 'UNSUPPORTED'
  /** ACCESS_FINE_LOCATION, or POST_NOTIFICATIONS on API 33+, is not granted. */
  | 'PERMISSION_MISSING'
  /** DayPlan isn't chosen under Developer Options -> Select mock location app. */
  | 'NOT_SELECTED'
  /** Everything is in place; no session running. */
  | 'READY'
  /** Actively injecting. */
  | 'RUNNING';

/** Mirrors the E_MOCK_* constants in MockLocationModule.kt. */
export type MockLocationErrorCode =
  | 'E_MOCK_INVALID_OPTIONS'
  | 'E_MOCK_PERMISSION'
  | 'E_MOCK_NOTIFICATIONS'
  | 'E_MOCK_NOT_SELECTED'
  | 'E_MOCK_NOT_RUNNING'
  | 'E_MOCK_SERVICE'
  | 'E_MOCK_SETTINGS'
  | 'E_MOCK_UNSUPPORTED';

export interface MockLocationTarget {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  bearing?: number;
  speed?: number;
  intervalMs?: number;
  /** Place name shown in the persistent notification. */
  label?: string;
}

export type RouteEndBehaviour = 'STOP' | 'LOOP' | 'PING_PONG';

export interface MockRouteTarget {
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  /** Defaults to STOP: hold at the destination rather than reverting. */
  endBehaviour?: RouteEndBehaviour;
  /** Cruise speed, ramped over the first and last ~50 m. Defaults to 50. */
  speedKmh?: number;
  altitude?: number;
  accuracy?: number;
  intervalMs?: number;
  label?: string;
}

/** Emitted about once a second while a route is running. */
export interface MockRouteProgress {
  /** 0 at the start, 1 at the destination. */
  fraction: number;
  metresTravelled: number;
  metresRemaining: number;
  speedMps: number;
  bearingDegrees: number;
  /** Milliseconds to the end of the current leg, or null if unknown. */
  etaMs: number | null;
  latitude: number;
  longitude: number;
  /**
   * True once a STOP route has arrived. The session keeps running and holds the
   * final fix — it does not revert to the real location.
   */
  finished: boolean;
}

export interface MockStatusEvent {
  status: MockStatus;
  error?: string | null;
}

/**
 * Every action returns a result rather than throwing, because the caller almost
 * always needs to *route* on the failure (open Developer Options, prompt for a
 * permission) rather than just display it.
 */
export type MockActionResult =
  | { ok: true }
  | {
      ok: false;
      code: MockLocationErrorCode;
      message: string;
      /**
       * Only set for E_MOCK_PERMISSION / E_MOCK_NOTIFICATIONS raised by the
       * runtime prompt, and it is a genuine tri-state:
       *   true      — user chose "don't ask again"; request() is now a no-op,
       *               so the only remedy is the settings deep-link.
       *   false     — user declined this time; prompting again still works.
       *   undefined — never reached the prompt (the native side rejected, e.g.
       *               notifications blocked at the channel level), so settings
       *               is the remedy.
       * Flattening this into prose is what made the first-run banner send
       * people to Settings when they had simply never been asked yet.
       */
      blockedPermanently?: boolean;
    };

export type PermissionResult =
  | { granted: true }
  | {
      granted: false;
      /** Which one blocked us, so the UI can explain the right thing. */
      permission: 'location' | 'notifications';
      /**
       * True when the user checked "don't ask again" — a further request() is a
       * silent no-op, so the only route left is openAppSettings().
       */
      blockedPermanently: boolean;
    };

// ── Platform gate ───────────────────────────────────────────────────────────

const native = Platform.OS === 'android' ? NativeMockLocation : null;

/** Android, with the native module actually registered in this build. */
export const isSupported: boolean = native != null;

const STATUS_EVENT = 'mockLocationStatusChanged';
const PROGRESS_EVENT = 'mockLocationProgress';

const UNSUPPORTED_RESULT: MockActionResult = {
  ok: false,
  code: 'E_MOCK_UNSUPPORTED',
  message: 'Simulating your location is only possible on Android.',
};

/** Android API level, or 0 when we're not on Android. */
function androidApiLevel(): number {
  if (Platform.OS !== 'android') return 0;
  return typeof Platform.Version === 'number' ? Platform.Version : 0;
}

function isMockStatus(value: unknown): value is MockStatus {
  return (
    value === 'UNSUPPORTED' ||
    value === 'PERMISSION_MISSING' ||
    value === 'NOT_SELECTED' ||
    value === 'READY' ||
    value === 'RUNNING'
  );
}

/**
 * Native rejections arrive as plain Errors with `code` bolted on. Normalise
 * into the discriminated result the callers branch on, and never let an
 * unrecognised code masquerade as a known one.
 */
function toFailure(error: unknown): MockActionResult {
  const code = (error as { code?: string } | null)?.code;
  const message =
    (error as { message?: string } | null)?.message ??
    'Something went wrong talking to the location service.';

  const known: MockLocationErrorCode[] = [
    'E_MOCK_INVALID_OPTIONS',
    'E_MOCK_PERMISSION',
    'E_MOCK_NOTIFICATIONS',
    'E_MOCK_NOT_SELECTED',
    'E_MOCK_NOT_RUNNING',
    'E_MOCK_SERVICE',
    'E_MOCK_SETTINGS',
    'E_MOCK_UNSUPPORTED',
  ];
  const matched = known.find((k) => k === code);
  return { ok: false, code: matched ?? 'E_MOCK_SERVICE', message };
}

function toOptions(target: MockLocationTarget): MockLocationOptions {
  // Passed through as-is; the native side owns validation and defaulting so
  // there is exactly one place those rules live.
  return { ...target };
}

// ── Status ──────────────────────────────────────────────────────────────────

export async function getStatus(): Promise<MockStatus> {
  if (!native) return 'UNSUPPORTED';
  try {
    const raw = await native.getStatus();
    return isMockStatus(raw) ? raw : 'READY';
  } catch {
    // A wedged native call shouldn't strand the UI with no status at all.
    return 'UNSUPPORTED';
  }
}

/** Whether DayPlan currently holds the mock-location app op. */
export async function isMockLocationEnabled(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isMockLocationEnabled();
  } catch {
    return false;
  }
}

/**
 * Whether a reboot interrupted a running session. We never auto-resume after a
 * restart, so this is how the UI knows to offer it.
 *
 * Reading does not clear — call clearBootInterrupted() once the user has
 * actually seen the notice. A read-and-clear loses it forever if the screen
 * unmounts before the promise settles.
 */
export async function peekBootInterrupted(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.peekBootInterrupted();
  } catch {
    return false;
  }
}

export async function clearBootInterrupted(): Promise<void> {
  if (!native) return;
  try {
    await native.clearBootInterrupted();
  } catch {
    // Best effort — worst case the notice shows once more.
  }
}

/**
 * Subscribe to native status changes.
 *
 * The emitter is constructed lazily and only on Android — building a
 * NativeEventEmitter around a null module is exactly the iOS crash this file
 * exists to avoid.
 */
export function addStatusListener(
  listener: (event: MockStatusEvent) => void,
): () => void {
  if (!native) return () => undefined;

  // The TurboModule satisfies NativeEventEmitter's addListener/removeListeners
  // contract; the cast is only because the codegen'd Spec type isn't declared
  // as a NativeModule.
  const emitter = new NativeEventEmitter(native as unknown as NativeModule);
  const subscription = emitter.addListener(
    STATUS_EVENT,
    (event: { status?: string; error?: string | null }) => {
      if (!isMockStatus(event?.status)) return;
      listener({ status: event.status, error: event.error ?? null });
    },
  );
  return () => subscription.remove();
}

/**
 * Subscribe to route progress.
 *
 * Nothing is emitted for static sessions, and the native side drops events
 * entirely when no React instance is attached, so the injection loop is never
 * gated on JS.
 */
export function addProgressListener(
  listener: (progress: MockRouteProgress) => void,
): () => void {
  if (!native) return () => undefined;
  const emitter = new NativeEventEmitter(native as unknown as NativeModule);
  const subscription = emitter.addListener(
    PROGRESS_EVENT,
    (event: MockRouteProgress) => {
      if (event == null || typeof event.fraction !== 'number') return;
      listener(event);
    },
  );
  return () => subscription.remove();
}

// ── Permissions ─────────────────────────────────────────────────────────────

/**
 * Requests both runtime permissions the session needs.
 *
 * POST_NOTIFICATIONS is not optional here even though it feels cosmetic: the
 * foreground service's notification is the only always-visible sign the session
 * is running and the only place the Stop action lives, so the native side
 * refuses to start without it. Note that notifee only ever asks for it inside
 * the hourly-alarm flow, so anyone who declined alarms has it denied today.
 */
export async function ensurePermissions(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return { granted: false, permission: 'location', blockedPermanently: false };
  }

  const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  if (!(await PermissionsAndroid.check(fine))) {
    const result = await PermissionsAndroid.request(fine, {
      title: 'Allow precise location',
      message:
        'Android requires location permission before an app is allowed to ' +
        'simulate a location. DayPlan does not read where you actually are.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      return {
        granted: false,
        permission: 'location',
        blockedPermanently:
          result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      };
    }
  }

  // Notifications became a runtime permission in Android 13 (API 33).
  if (androidApiLevel() >= 33) {
    const notifications = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (!(await PermissionsAndroid.check(notifications))) {
      const result = await PermissionsAndroid.request(notifications, {
        title: 'Allow notifications',
        message:
          'The simulated location runs behind a permanent notification. It is ' +
          'how you can tell it is on, and how you turn it off.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      });
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        return {
          granted: false,
          permission: 'notifications',
          blockedPermanently:
            result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        };
      }
    }
  }

  return { granted: true };
}

// ── Session ─────────────────────────────────────────────────────────────────

/**
 * Requests permissions if needed, then starts injecting.
 *
 * Does NOT try to fix a missing Developer Options selection — that one needs the
 * user to walk through a system screen, so it comes back as
 * E_MOCK_NOT_SELECTED for the UI to explain.
 */
export async function start(
  target: MockLocationTarget,
): Promise<MockActionResult> {
  if (!native) return UNSUPPORTED_RESULT;

  const permission = await ensurePermissions();
  if (!permission.granted) {
    return {
      ok: false,
      code:
        permission.permission === 'notifications'
          ? 'E_MOCK_NOTIFICATIONS'
          : 'E_MOCK_PERMISSION',
      message: permission.blockedPermanently
        ? 'That permission is blocked. Turn it on in DayPlan’s settings.'
        : 'That permission is needed before a location can be simulated.',
      blockedPermanently: permission.blockedPermanently,
    };
  }

  try {
    await native.start(toOptions(target));
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Starts a moving session along a straight (great-circle) line.
 *
 * Same permission flow as {@link start}; the failure codes are identical, so
 * callers can share their routing logic.
 */
export async function startRoute(
  target: MockRouteTarget,
): Promise<MockActionResult> {
  if (!native) return UNSUPPORTED_RESULT;

  const permission = await ensurePermissions();
  if (!permission.granted) {
    return {
      ok: false,
      code:
        permission.permission === 'notifications'
          ? 'E_MOCK_NOTIFICATIONS'
          : 'E_MOCK_PERMISSION',
      message: permission.blockedPermanently
        ? 'That permission is blocked. Turn it on in DayPlan’s settings.'
        : 'That permission is needed before a location can be simulated.',
      blockedPermanently: permission.blockedPermanently,
    };
  }

  try {
    await native.startRoute({ ...target } as RouteOptions);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/** Move the target without restarting the session. */
export async function update(
  target: MockLocationTarget,
): Promise<MockActionResult> {
  if (!native) return UNSUPPORTED_RESULT;
  try {
    await native.update(toOptions(target));
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/** Stops and fully restores the real location providers. */
export async function stop(): Promise<MockActionResult> {
  if (!native) return UNSUPPORTED_RESULT;
  try {
    await native.stop();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

// ── System screens ──────────────────────────────────────────────────────────

export async function openDeveloperOptions(): Promise<MockActionResult> {
  if (!native) return UNSUPPORTED_RESULT;
  try {
    await native.openDeveloperOptions();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Notification settings, deep-linked to the mock-location channel where the
 * platform supports it. This — not ensurePermissions() — is the remedy when
 * E_MOCK_NOTIFICATIONS comes back with the permission already granted: the
 * block is on the app or the channel, and PermissionsAndroid.request is a
 * silent no-op in that state.
 */
export async function openNotificationSettings(): Promise<MockActionResult> {
  if (!native) return UNSUPPORTED_RESULT;
  try {
    await native.openNotificationSettings();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function openAppSettings(): Promise<MockActionResult> {
  if (!native) return UNSUPPORTED_RESULT;
  try {
    await native.openAppSettings();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Battery optimisation (a suggestion, never a requirement) ────────────────

export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isIgnoringBatteryOptimizations();
  } catch {
    return false;
  }
}

export async function requestIgnoreBatteryOptimizations(): Promise<MockActionResult> {
  if (!native) return UNSUPPORTED_RESULT;
  try {
    await native.requestIgnoreBatteryOptimizations();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}
