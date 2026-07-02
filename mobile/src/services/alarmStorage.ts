import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Alarm settings live entirely on-device.
 *
 * As of the hourly-reminder redesign, the only thing the user can configure
 * is whether the feature is on. The schedule (top of every hour from 11:00
 * to 23:00) is fixed and the body text is computed at schedule time from
 * the day's pending task count — neither needs persisted preferences.
 *
 * Snooze used to live here too. It was removed because the alarm now fires
 * every hour anyway: if you miss one, the next is coming in under 60
 * minutes, which is shorter than every snooze duration we previously
 * offered. A snooze button would have been redundant.
 */

const KEY = "dayplan-alarm-config";

/**
 * Hourly alarm window — the only schedule the user can't change.
 * 11:00 → 23:00 inclusive = 13 fires per day. The next fire after 23:00
 * would be 24:00, which satisfies the "no alarms past 23:30" requirement
 * without needing a special last-hour case.
 *
 * Single source of truth so UI copy ("11 AM – 11 PM") and the scheduler
 * in notifications.ts can never drift apart.
 */
export const ALARM_START_HOUR = 11;
export const ALARM_END_HOUR = 23;

export interface AlarmConfig {
  enabled: boolean;
}

const DEFAULT_CONFIG: AlarmConfig = {
  enabled: false,
};

export async function loadAlarmConfig(): Promise<AlarmConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_CONFIG;

    // Forward-compatible parse: the previous shape was
    //   { enabled, time, snoozeMinutes }
    // We deliberately read ONLY `enabled` and ignore extra keys, so users
    // upgrading from the previous version keep their on/off preference.
    // The legacy fields are dropped on next save.
    const parsed = JSON.parse(raw) as Partial<AlarmConfig>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
    };
  } catch {
    // Storage is best-effort — if AsyncStorage is wedged, default to off.
    return DEFAULT_CONFIG;
  }
}

export async function saveAlarmConfig(config: AlarmConfig): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(config));
}
