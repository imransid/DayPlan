import notifee, {
  AndroidImportance,
  EventType,
  RepeatFrequency,
  TriggerType,
  TimestampTrigger,
} from "@notifee/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { config } from "../config";

/**
 * Phone-driven scheduled Discord posting.
 *
 * The backend already knows *what* to post (goal list / work-update) and does
 * it idempotently when asked via `POST /api/scheduler/run-mine`. The problem is
 * *when*: on a sleeping free-tier host the server's own clock isn't ticking, so
 * historically a post only went out when the user opened the app after their
 * configured time (the foreground nudge in HomeScreen) — "manual works, auto
 * doesn't".
 *
 * This module closes that gap from the device: it asks the OS alarm clock to
 * fire a notifee trigger at the user's goal/work-update time, and when that
 * trigger fires — EVEN IF THE APP IS CLOSED — notifee runs a short background
 * JS task (verified in NotifeeEventSubscriber: not-in-foreground →
 * startHeadlessTask(..., 60000)). That task calls the SAME endpoint the manual
 * "Send now" button uses (POST /discord/test-publish → publishNow), which posts
 * unconditionally — so the phone, having already fired at the right local time,
 * is the reliable clock. See publishScheduledKind for why NOT run-mine.
 *
 * publishNow writes the per-day success marker, so the foreground nudge and any
 * server cron (both idempotent on /scheduler/run-mine) skip afterwards — no
 * double-posting.
 *
 * Platform reality:
 *  - Android: fires and posts with the app closed (AlarmManager allowWhileIdle
 *    + the 60s headless task). This is the target.
 *  - iOS: the notification is delivered on schedule, but Apple does not run app
 *    JS on delivery while the app is killed — so on iOS this degrades to a
 *    tap-to-send reminder (tapping opens the app, whose foreground nudge posts).
 */

const POSTS_CHANNEL_ID = "dayplan-posts";
const GOAL_TRIGGER_ID = "dayplan-post-goal";
const WORK_UPDATE_TRIGGER_ID = "dayplan-post-workupdate";

const POST_TRIGGER_IDS = [GOAL_TRIGGER_ID, WORK_UPDATE_TRIGGER_ID];

// redux-persist stores the whole root under this key; `auth` is a nested JSON
// string inside it (see store.ts: key 'dayplan-root', whitelist includes auth).
// We read it directly so the background task can authenticate without booting
// the full redux/React tree.
const PERSIST_ROOT_KEY = "persist:dayplan-root";

const CONFIG_KEY = "dayplan-autopost-config";

export interface AutoPostConfig {
  enabled: boolean;
}

const DEFAULT_CONFIG: AutoPostConfig = { enabled: false };

export async function loadAutoPostConfig(): Promise<AutoPostConfig> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AutoPostConfig>;
    return { enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveAutoPostConfig(config: AutoPostConfig): Promise<void> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/** "HH:mm" → {hour, minute}, or null if malformed. */
function parseHHmm(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? "");
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** The next future occurrence of a local HH:mm — today if it hasn't passed, else tomorrow. */
function nextOccurrence(hour: number, minute: number): Date {
  const now = new Date();
  const at = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0,
  );
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await notifee.createChannel({
    id: POSTS_CHANNEL_ID,
    name: "Scheduled Discord posts",
    description:
      "Fires at your goal / work-update times to post to Discord, even when the app is closed",
    importance: AndroidImportance.DEFAULT,
  });
}

async function scheduleOne(
  id: string,
  time: string | undefined,
  body: string,
): Promise<void> {
  await notifee.cancelTriggerNotification(id);
  const parsed = time ? parseHHmm(time) : null;
  if (!parsed) return;

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: nextOccurrence(parsed.hour, parsed.minute).getTime(),
    // Fires once a day forever — held by the OS, so it survives the app being
    // swiped away or the device idling (no need to reschedule on app open).
    repeatFrequency: RepeatFrequency.DAILY,
    // On Android, back the repeat with AlarmManager so it's exact and fires
    // through Doze even when the app is killed — same mechanism the hourly
    // alarm uses.
    alarmManager:
      Platform.OS === "android" ? { allowWhileIdle: true } : undefined,
  };

  await notifee.createTriggerNotification(
    {
      id,
      title: "DayPlan",
      body,
      android: {
        channelId: POSTS_CHANNEL_ID,
        smallIcon: "ic_notification",
        // Tapping opens the app; the foreground nudge then posts too — the
        // reliable path on iOS and a belt-and-braces path on Android.
        pressAction: { id: "open-app", launchActivity: "default" },
      },
    },
    trigger,
  );
}

/** (Re)schedule the daily goal + work-update triggers for the given times. */
export async function scheduleAutoPosts(
  goalPostTime: string | undefined,
  workUpdateTime: string | undefined,
): Promise<void> {
  await ensureChannel();
  await scheduleOne(
    GOAL_TRIGGER_ID,
    goalPostTime,
    "Posting today’s goal to Discord…",
  );
  await scheduleOne(
    WORK_UPDATE_TRIGGER_ID,
    workUpdateTime,
    "Posting your work update to Discord…",
  );
}

/** Cancel both scheduled post triggers. Idempotent. */
export async function cancelAutoPosts(): Promise<void> {
  await Promise.all(
    POST_TRIGGER_IDS.map((id) => notifee.cancelTriggerNotification(id)),
  );
}

/**
 * Reconcile the OS schedule with the current config + times. Single entry point
 * used by the Settings toggle and by the time pickers.
 */
export async function syncAutoPosts(
  goalPostTime: string | undefined,
  workUpdateTime: string | undefined,
): Promise<void> {
  const cfg = await loadAutoPostConfig();
  if (cfg.enabled) {
    await scheduleAutoPosts(goalPostTime, workUpdateTime);
  } else {
    await cancelAutoPosts();
  }
}

/** Read the persisted JWT without booting redux — for the background task. */
async function getAuthToken(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(PERSIST_ROOT_KEY);
    if (!raw) return null;
    const root = JSON.parse(raw) as Record<string, string>;
    const authRaw = root?.auth;
    if (!authRaw) return null;
    const auth = JSON.parse(authRaw) as { accessToken?: string | null };
    return auth?.accessToken ?? null;
  } catch {
    return null;
  }
}

/** Which post kind each trigger id is responsible for. */
const KIND_BY_TRIGGER_ID: Record<string, "goal" | "work_update"> = {
  [GOAL_TRIGGER_ID]: "goal",
  [WORK_UPDATE_TRIGGER_ID]: "work_update",
};

/**
 * Publish one kind via the SAME endpoint the manual "Send now" button uses
 * (POST /discord/test-publish → publishNow).
 *
 * Why test-publish and NOT /scheduler/run-mine: run-mine re-decides "is this
 * due?" using the user's *stored profile* timezone (localTime >= HH:mm). The OS
 * alarm here already fired at the *device's* local time, so if the device tz and
 * the saved profile tz differ (traveling, wrong tz at signup) — or across a DST
 * shift — run-mine would compute a different clock and SKIP the post even though
 * the trigger fired. That was the "auto never posts but manual works" bug: the
 * manual button hits test-publish, which posts unconditionally. So do the same.
 *
 * publishNow writes the per-day success marker, so the foreground nudge and any
 * server cron (both idempotent on /scheduler/run-mine) skip afterwards — no
 * double-post. A daily trigger fires once, so it can't double-post itself.
 */
async function publishScheduledKind(kind: "goal" | "work_update"): Promise<void> {
  const token = await getAuthToken();
  if (!token) return; // logged out — nothing to post as
  try {
    await fetch(`${config.apiUrl}/discord/test-publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind }),
    });
  } catch {
    // Best-effort: no network, or the free-tier host is cold-starting. The
    // foreground nudge on next app open will catch up.
  }
}

/**
 * Handle a notifee event for our post triggers. Wired into BOTH the background
 * handler (index.js, runs when the app is killed) and the foreground handler
 * (App.tsx, for when a trigger fires while the app happens to be open).
 * No-ops for any event that isn't one of our post triggers being DELIVERED.
 */
export async function handleScheduledPostEvent(
  type: EventType,
  detail: { notification?: { id?: string } },
): Promise<void> {
  if (type !== EventType.DELIVERED) return;
  const id = detail?.notification?.id;
  if (!id) return;
  const kind = KIND_BY_TRIGGER_ID[id];
  if (!kind) return; // not one of our post triggers
  await publishScheduledKind(kind);
}

/** Foreground registration — call once from App.tsx. Returns an unsubscribe. */
export function registerScheduledPostHandler(): () => void {
  return notifee.onForegroundEvent(({ type, detail }) => {
    void handleScheduledPostEvent(type, detail);
  });
}
