import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Android-only system-wide mock location provider.
 *
 * This drives the platform's documented test-provider API
 * (LocationManager.addTestProvider / setTestProviderLocation), which the user
 * must opt into by picking DayPlan under Developer Options -> "Select mock
 * location app". Every other app on the device then reads the injected fix.
 *
 * Events are emitted over RCTDeviceEventEmitter rather than a codegen'd
 * EventEmitter<T>, so `addListener` / `removeListeners` must be declared here
 * for NativeEventEmitter to bind without warning. They are no-ops natively —
 * the emitter is process-wide, not per-subscription.
 *
 * The iOS side deliberately has no implementation: there is no equivalent
 * system-wide API. The JS wrapper (src/services/mockLocation.ts) never reaches
 * this module off Android.
 */

export type MockLocationOptions = {
  latitude: number;
  longitude: number;
  /** Metres above the WGS84 ellipsoid. Defaults to 0. */
  altitude?: number;
  /**
   * Horizontal accuracy in metres. MUST be > 0 — a Location with no accuracy
   * fails Location.isComplete() and setTestProviderLocation rejects it with
   * IllegalArgumentException. Defaults to 3.0.
   */
  accuracy?: number;
  /** Degrees east of true north. Defaults to 0. */
  bearing?: number;
  /** Metres/second. Defaults to 0. */
  speed?: number;
  /**
   * How often the fix is re-injected. A single injection goes stale within
   * seconds and consumers silently fall back to the real fix, so the service
   * re-pushes on this cadence. Defaults to 1000, clamped to [250, 60000].
   */
  intervalMs?: number;
  /**
   * Human-readable place name shown in the persistent notification, e.g.
   * "London, United Kingdom". Falls back to formatted coordinates.
   */
  label?: string;
};

/**
 * A moving location. Straight-line (great-circle) geometry is generated
 * natively from the two endpoints — no network. Road geometry arrives in a
 * later step and substitutes the points without changing this shape.
 */
export type RouteOptions = {
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  /** 'STOP' (default), 'LOOP' or 'PING_PONG'. */
  endBehaviour?: string;
  /** Cruise speed. Ramped over the first and last ~50 m. Defaults to 50. */
  speedKmh?: number;
  altitude?: number;
  accuracy?: number;
  intervalMs?: number;
  label?: string;
};

export interface Spec extends TurboModule {
  /** True when DayPlan holds the OPSTR_MOCK_LOCATION app op. */
  isMockLocationEnabled(): Promise<boolean>;
  /** 'STATIC', 'ROUTE', or 'NONE' when nothing is running. */
  getSessionMode(): Promise<string>;
  /** One of MockStatus — see src/services/mockLocation.ts for the union. */
  getStatus(): Promise<string>;
  /** Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS. */
  openDeveloperOptions(): Promise<void>;
  /** App info screen — used when a permission is permanently denied. */
  openAppSettings(): Promise<void>;
  /**
   * Notification settings, deep-linked to the mock-location channel on API 26+.
   * Used when notifications are blocked at the app/channel level, where
   * re-requesting POST_NOTIFICATIONS does nothing.
   */
  openNotificationSettings(): Promise<void>;
  /** True when the OS is exempting DayPlan from Doze battery optimisation. */
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  /** Fires the system's "allow background activity?" dialog. Dismissible. */
  requestIgnoreBatteryOptimizations(): Promise<void>;

  /**
   * True if a reboot interrupted an active session. We never auto-resume after
   * a reboot, so this is how the UI knows to offer it.
   *
   * Split from clearing on purpose: a read-and-clear would lose the notice
   * forever if the screen unmounted between the call and its resolution. The
   * flag survives until something explicitly clears it.
   */
  peekBootInterrupted(): Promise<boolean>;
  /** Call once the user has actually seen the notice, or started a session. */
  clearBootInterrupted(): Promise<void>;

  start(options: MockLocationOptions): Promise<void>;
  /** Starts a moving session. Progress arrives on 'mockLocationProgress'. */
  startRoute(options: RouteOptions): Promise<void>;
  /**
   * Freezes a route where it is. The session keeps injecting the frozen fix —
   * stopping injection would let it go stale and consumers fall back to real GPS.
   */
  pauseRoute(): Promise<void>;
  /** Resumes from exactly where the pause left off, preserving position. */
  resumeRoute(): Promise<void>;
  /** Move the target without tearing down the providers or the service. */
  update(options: MockLocationOptions): Promise<void>;
  stop(): Promise<void>;

  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

/**
 * `get`, not `getEnforcing`: getEnforcing throws the moment this module is
 * imported on a platform that doesn't register it, which would crash the app on
 * iOS just by pulling in the wrapper. `get` returns null there instead, and
 * src/services/mockLocation.ts turns that into an UNSUPPORTED no-op.
 */
export default TurboModuleRegistry.get<Spec>('MockLocation');
