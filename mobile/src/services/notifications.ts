import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  AuthorizationStatus,
  EventType,
  TriggerType,
  TimestampTrigger,
} from "@notifee/react-native";
import { Platform } from "react-native";

import {
  loadAlarmConfig,
  ALARM_START_HOUR,
  ALARM_END_HOUR,
} from "./alarmStorage";

// ─── Channel + ID constants ─────────────────────────────────────────────

const ALARM_CHANNEL_ID = "dayplan-alarm";

/**
 * Hourly alarm window — single source of truth lives in alarmStorage.ts so
 * UI copy ("rings from 11 AM to 11 PM") and scheduling stay in sync. With
 * the current values the schedule is 11:00, 12:00, ..., 23:00 (13 fires).
 * The "no alarms past 23:30" requirement is satisfied because the last
 * fire is 23:00 and the next would be 24:00.
 */

const alarmIdForHour = (hour: number) => `dayplan-alarm-hour-${hour}`;

/**
 * Legacy notification IDs from the previous alarm design (single daily
 * alarm + snooze). We unconditionally cancel these in `cancelHourlyAlarms`
 * so users upgrading from older builds don't end up with both schedules
 * firing simultaneously.
 */
const LEGACY_ALARM_IDS = [
  "dayplan-alarm-notification",
  "dayplan-alarm-notification-snooze",
];

// Hourly reminders also lived under their own IDs in the previous version.
// Cancel those on upgrade for the same reason.
const LEGACY_HOURLY_IDS = Array.from(
  { length: 24 },
  (_, h) => `dayplan-hourly-${h}`,
);

// ─── Permissions + channel setup ────────────────────────────────────────

/**
 * Create (or refresh) the Android alarm channel — HIGH importance + alarm
 * category so the OS treats these like the system Clock app: bypasses Do Not
 * Disturb, full-screen on lock, ringer respected.
 *
 * `sound: "default"` is the initial ringtone; the user can change it to any
 * system tone (including proper alarm sounds) via openAlarmSoundSettings(),
 * which is the only way to change a channel's sound after it's created —
 * Android channel sound is immutable through the API once the channel exists.
 */
export async function ensureAlarmChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await notifee.createChannel({
    id: ALARM_CHANNEL_ID,
    name: "Hourly task alarm",
    description:
      "Rings every hour from 11 AM to 11 PM with your remaining tasks",
    importance: AndroidImportance.HIGH,
    sound: "default",
    vibration: true,
    vibrationPattern: [300, 500, 300, 500],
    bypassDnd: true,
  });
}

export async function requestPermissions(): Promise<boolean> {
  const settings = await notifee.requestPermission({
    // criticalAlert is iOS-only; lets the alarm play even in Silent mode if
    // the user grants the entitlement. Best-effort — falls back to a normal
    // notification with sound when not granted.
    criticalAlert: true,
  });

  await ensureAlarmChannel();

  return (
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
  );
}

/**
 * Open the OS settings where the user picks the alarm RINGTONE (any system
 * tone, alarm sounds included) and tweaks vibration. On Android this deep-links
 * straight to the alarm channel's settings; a channel's sound can only be
 * changed here (not via the API) once the channel exists, so we ensure it
 * first. iOS has no per-channel sounds (custom sounds require bundled audio
 * files), so we open the app's notification settings as the closest option.
 */
export async function openAlarmSoundSettings(): Promise<void> {
  if (Platform.OS === "android") {
    await ensureAlarmChannel();
    await notifee.openNotificationSettings(ALARM_CHANNEL_ID);
  } else {
    await notifee.openNotificationSettings();
  }
}

// ─── Hourly alarm scheduling ────────────────────────────────────────────

/**
 * Schedule one alarm per hour from 11:00 to 23:00 today.
 *
 * ─── Why TODAY only, not RepeatFrequency.DAILY ──────────────────────────
 * The notification body shows "{N} tasks remaining today". DAILY repeat
 * would freeze today's count into tomorrow's notification — by next
 * morning the body would read e.g. "5 tasks remaining today" with stale
 * data. Instead, we schedule for today only and rely on HomeScreen's
 * day-rollover effect (already present) to fire `syncHourlyAlarms` again
 * when the next day starts.
 *
 * ─── Why this fires when the app is killed ──────────────────────────────
 * - `alarmManager.allowWhileIdle: true` — fires through Android Doze, even
 *   if DayPlan was swiped from recents. Exactly how the system Clock app
 *   stays reliable.
 * - The schedule is held by the OS (Android AlarmManager / iOS UN), so
 *   the JS engine doesn't need to be running.
 *
 * ─── Why no snooze button ───────────────────────────────────────────────
 * A snooze action made sense for a single daily alarm. Here, the next
 * alarm is at most 60 minutes away — shorter than every snooze interval
 * we previously offered. A button that re-fires sooner than the next
 * scheduled fire would be confusing.
 *
 * ─── Why timeoutAfter: 60_000 ───────────────────────────────────────────
 * loopSound: true gives that classic alarm-clock ring, but at 13 fires
 * per day an unkilled loop would be hostile. timeoutAfter caps each ring
 * at 60s — if the user misses it, the alarm clears itself and the next
 * hourly will still fire normally. iOS doesn't support sound looping for
 * third-party apps anyway, so this only affects Android.
 *
 * Pass pendingCount = 0 (or call cancelHourlyAlarms directly) to clear
 * everything — there's no point ringing about an empty list.
 */
export async function scheduleHourlyAlarms(
  pendingCount: number,
): Promise<void> {
  // Always start from a clean slate — same call cancels legacy IDs too.
  await cancelHourlyAlarms();

  if (pendingCount <= 0) return;

  const now = new Date();
  const body = `${pendingCount} task${
    pendingCount === 1 ? "" : "s"
  } remaining today`;

  for (let hour = ALARM_START_HOUR; hour <= ALARM_END_HOUR; hour++) {
    const fireAt = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      0,
      0,
      0,
    );

    // Skip past hours — the day-rollover handler in HomeScreen will
    // re-schedule tomorrow's window when the local calendar day flips.
    if (fireAt.getTime() <= now.getTime()) continue;

    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: fireAt.getTime(),
      alarmManager:
        Platform.OS === "android" ? { allowWhileIdle: true } : undefined,
    };

    await notifee.createTriggerNotification(
      {
        id: alarmIdForHour(hour),
        title: "DayPlan",
        body,
        android: {
          channelId: ALARM_CHANNEL_ID,
          smallIcon: "ic_notification",
          category: AndroidCategory.ALARM,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          loopSound: true,
          // 60s ring cap — see note above. Without this, a missed alarm
          // would loop indefinitely until manually dismissed.
          timeoutAfter: 60_000,
          autoCancel: true,
          fullScreenAction: { id: "default", launchActivity: "default" },
          pressAction: { id: "open-app", launchActivity: "default" },
          actions: [{ title: "Dismiss", pressAction: { id: "dismiss-alarm" } }],
        },
        ios: {
          sound: "default",
          critical: true,
          criticalVolume: 1.0,
        },
      },
      trigger,
    );
  }
}

/**
 * Cancel every alarm and reminder this app has ever scheduled. Idempotent
 * and cheap — safe to call on every config change. Also cleans up legacy
 * IDs from older app versions, so a user upgrading from the daily-alarm
 * design doesn't end up with both schedules ringing.
 */
export async function cancelHourlyAlarms(): Promise<void> {
  const ids: string[] = [];

  // Current hourly IDs
  for (let h = ALARM_START_HOUR; h <= ALARM_END_HOUR; h++) {
    ids.push(alarmIdForHour(h));
  }
  // Legacy IDs (single daily alarm + previous gentle hourly reminders)
  ids.push(...LEGACY_ALARM_IDS, ...LEGACY_HOURLY_IDS);

  await Promise.all([
    ...ids.map((id) => notifee.cancelTriggerNotification(id)),
    ...ids.map((id) => notifee.cancelDisplayedNotification(id)),
  ]);
}

/**
 * Reconcile alarm schedule with current config + task count.
 *
 * Single entry point used by both SettingsScreen (when the user toggles
 * the switch) and HomeScreen (when the pending task count changes). The
 * caller doesn't need to decide schedule-vs-cancel — pass the latest
 * count and this picks the right action:
 *
 *   • alarm enabled + pending > 0 → schedule the day's hourlies
 *   • otherwise                    → cancel everything
 *
 * If the user's notification permission is missing the alarms will be
 * scheduled but won't be allowed to display by the OS. Permission UI is
 * handled at the toggle site (SettingsScreen) — we don't request here
 * because that would surface a permission prompt during routine
 * background reschedules, which is a hostile UX.
 */
export async function syncHourlyAlarms(pendingCount: number): Promise<void> {
  const config = await loadAlarmConfig();
  if (config.enabled) {
    await scheduleHourlyAlarms(pendingCount);
  } else {
    await cancelHourlyAlarms();
  }
}

// ─── Action handlers ────────────────────────────────────────────────────

/**
 * Wire up alarm action buttons (Dismiss).
 *
 * Call once from the app's entry point (index.js) for the foreground
 * handler, and once outside React for the background handler. Signature
 * unchanged from the previous version so existing index.js wiring
 * keeps working — only the internal logic was simplified.
 */
export function registerAlarmActionHandler() {
  return notifee.onForegroundEvent(async ({ type, detail }) => {
    if (type !== EventType.ACTION_PRESS) return;
    await handleAlarmAction(detail.pressAction?.id);
  });
}

/** Shared implementation, exposed so index.js can pass it to
 *  notifee.onBackgroundEvent. */
export async function handleAlarmAction(actionId: string | undefined) {
  if (actionId === "dismiss-alarm") {
    // Cancel every currently-displayed hourly alarm. We don't know which
    // hour was tapped from a single ID — easier to just clear them all.
    // Tomorrow's schedule is built fresh by syncHourlyAlarms anyway.
    for (let h = ALARM_START_HOUR; h <= ALARM_END_HOUR; h++) {
      await notifee.cancelDisplayedNotification(alarmIdForHour(h));
    }
  }
}

export async function cancelAll(): Promise<void> {
  await notifee.cancelAllNotifications();
}
