import { AppRegistry } from "react-native";
import "react-native-gesture-handler";
import notifee, { EventType } from "@notifee/react-native";
import App from "./App";
import { name as appName } from "./app.json";
import { handleAlarmAction } from "./src/services/notifications";
import { handleScheduledPostEvent } from "./src/services/scheduledPosts";

/**
 * Background event handler — runs when the OS delivers a notification action
 * while the app is closed/backgrounded. Notifee REQUIRES this to be registered
 * at the JS root (here, not inside React) so it survives even when the React
 * tree is torn down. Without it the "Dismiss" button on the alarm notification
 * does nothing.
 *
 * Delegates to the SAME handler the foreground path uses
 * (services/notifications.ts → handleAlarmAction) so the two can never drift.
 * The previous version was stale: it referenced the old single-daily-alarm
 * design ("dayplan-alarm-notification" + a "snooze-alarm" action) that no
 * longer exists — the current design schedules per-hour ids
 * ("dayplan-alarm-hour-<h>") with only a "dismiss-alarm" action. So the old
 * background Dismiss cancelled ids that were never shown and could re-create a
 * snoozed alarm that the rest of the app knows nothing about.
 */
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.ACTION_PRESS) {
    await handleAlarmAction(detail.pressAction?.id);
    return;
  }
  // A scheduled goal / work-update trigger firing while the app is closed lands
  // here as an EventType.DELIVERED headless task — post to Discord from the
  // background so "auto-post at the set time" works without opening the app.
  await handleScheduledPostEvent(type, detail);
});

AppRegistry.registerComponent(appName, () => App);
