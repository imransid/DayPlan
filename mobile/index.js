import { AppRegistry } from "react-native";
import "react-native-gesture-handler";
import notifee, {
  EventType,
  TriggerType,
  RepeatFrequency,
  AndroidCategory,
} from "@notifee/react-native";
import App from "./App";
import { name as appName } from "./app.json";

/**
 * Background event handler — runs when the OS delivers a notification
 * action while the app is closed/backgrounded. Notifee REQUIRES this to be
 * registered at the JS root (here, not inside React) so it survives even
 * when the React tree is torn down. Without it the "Dismiss" and "Snooze"
 * buttons on the alarm notification do nothing.
 */
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.ACTION_PRESS) return;
  const actionId = detail.pressAction?.id;
  const ALARM_ID = "dayplan-alarm-notification";

  if (actionId === "dismiss-alarm") {
    await notifee.cancelDisplayedNotification(ALARM_ID);
    await notifee.cancelDisplayedNotification(`${ALARM_ID}-snooze`);
    return;
  }

  if (actionId === "snooze-alarm") {
    await notifee.cancelDisplayedNotification(ALARM_ID);
    await notifee.createTriggerNotification(
      {
        id: `${ALARM_ID}-snooze`,
        title: "Alarm (snoozed)",
        body: "Time to check your day plan",
        android: {
          channelId: "dayplan-alarm",
          smallIcon: "ic_notification",
          category: AndroidCategory.ALARM,
          loopSound: true,
          ongoing: true,
          autoCancel: false,
          fullScreenAction: { id: "default", launchActivity: "default" },
          actions: [
            { title: "Dismiss", pressAction: { id: "dismiss-alarm" } },
            { title: "Snooze 5m", pressAction: { id: "snooze-alarm" } },
          ],
        },
        ios: { sound: "default", critical: true },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: Date.now() + 5 * 60 * 1000,
        repeatFrequency: RepeatFrequency.NONE,
      },
    );
  }
});

AppRegistry.registerComponent(appName, () => App);
