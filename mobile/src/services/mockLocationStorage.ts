import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MockLocationTarget } from './mockLocation';

/**
 * Saved places and the last-used target, on-device only.
 *
 * AsyncStorage rather than the Redux store because none of this is server-backed
 * and it needs to be readable before the store rehydrates — same reasoning as
 * services/alarmStorage.ts, and the same defensive-parse style: a corrupt or
 * half-written blob degrades to defaults instead of crashing the screen.
 *
 * Note the native side keeps its own copy of the active session in
 * SharedPreferences (MockLocationStore.kt) — that one has to survive process
 * death without a JS context, so the two deliberately do not share storage.
 */

const KEY = 'dayplan-mock-location';

export interface SavedPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface MockLocationState {
  places: SavedPlace[];
  /** Pre-selected when the screen opens. Null before the first session. */
  last: MockLocationTarget | null;
}

const DEFAULT_STATE: MockLocationState = { places: [], last: null };

/** Matches the id style used for notes and notebooks. */
export function createPlaceId(): string {
  return `mp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Coordinates that are absent, NaN or out of range are dropped, not clamped. */
function parsePlace(raw: unknown): SavedPlace | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, name, latitude, longitude } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof name !== 'string') return null;
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) return null;
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
    return null;
  }
  return { id, name, latitude, longitude };
}

function parseTarget(raw: unknown): MockLocationTarget | null {
  const place = parsePlace({ id: 'x', name: '', ...(raw as object) });
  if (!place) return null;
  const source = raw as Record<string, unknown>;
  const target: MockLocationTarget = {
    latitude: place.latitude,
    longitude: place.longitude,
  };
  if (isFiniteNumber(source.altitude)) target.altitude = source.altitude;
  if (isFiniteNumber(source.accuracy) && source.accuracy > 0) {
    target.accuracy = source.accuracy;
  }
  if (isFiniteNumber(source.bearing)) target.bearing = source.bearing;
  if (isFiniteNumber(source.speed)) target.speed = source.speed;
  if (isFiniteNumber(source.intervalMs)) target.intervalMs = source.intervalMs;
  if (typeof source.label === 'string') target.label = source.label;
  return target;
}

export async function loadMockLocationState(): Promise<MockLocationState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;

    const parsed = JSON.parse(raw) as Partial<MockLocationState>;
    return {
      places: Array.isArray(parsed.places)
        ? parsed.places
            .map(parsePlace)
            .filter((p): p is SavedPlace => p !== null)
        : [],
      last: parsed.last ? parseTarget(parsed.last) : null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export async function saveMockLocationState(
  state: MockLocationState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Best-effort, exactly like alarmStorage: losing a saved place is not worth
    // failing the action the user actually asked for.
  }
}
