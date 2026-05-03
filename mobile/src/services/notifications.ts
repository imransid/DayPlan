import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  TriggerType,
  TimestampTrigger,
  RepeatFrequency,
} from '@notifee/react-native';
import { Platform } from 'react-native';

const CHANNEL_ID = 'dayplan-hourly';

export async function requestPermissions(): Promise<boolean> {
  const settings = await notifee.requestPermission();

  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Hourly reminders',
      importance: AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  return (
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
  );
}

/**
 * Schedule one notification per hour between startHour and endHour for today.
 * Cancels any previously scheduled DayPlan notifications first.
 */
export async function scheduleHourlyReminders(
  startHour = 9,
  endHour = 21,
  pendingCount = 0,
): Promise<void> {
  await notifee.cancelAllNotifications();

  const now = new Date();
  const body =
    pendingCount > 0
      ? `${pendingCount} task${pendingCount === 1 ? '' : 's'} remaining today`
      : 'Quick check-in';

  for (let hour = startHour; hour <= endHour; hour++) {
    if (hour <= now.getHours()) continue; // don't schedule in the past

    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hour,
        0,
        0,
      ).getTime(),
      repeatFrequency: RepeatFrequency.DAILY,
    };

    await notifee.createTriggerNotification(
      {
        id: `dayplan-hourly-${hour}`,
        title: 'DayPlan',
        body,
        android: { channelId: CHANNEL_ID, smallIcon: 'ic_notification' },
        ios: { sound: 'default' },
      },
      trigger,
    );
  }
}

export async function cancelAll(): Promise<void> {
  await notifee.cancelAllNotifications();
}
