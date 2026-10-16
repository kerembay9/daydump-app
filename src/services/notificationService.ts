import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIF_STORAGE_KEY = '@daydump_daily_notification_enabled';
const DAILY_NOTIF_ID = 'daydump_daily_recap_8pm';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class NotificationService {
  /**
   * Initialize notification channels (Android) and register default 8:00 PM schedule
   */
  static async init(): Promise<void> {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('daily_dump_channel', {
          name: 'Daily Dump Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF9500',
        });
      }

      // Check if user has enabled notifications (default to true on first launch)
      const stored = await AsyncStorage.getItem(NOTIF_STORAGE_KEY);
      if (stored === null) {
        await this.setEnabled(true);
      } else if (stored === 'true') {
        await this.scheduleDailyRecap(20, 0);
      }
    } catch (e) {
      console.warn('[NotificationService] init error:', e);
    }
  }

  /**
   * Check if notifications are enabled
   */
  static async isEnabled(): Promise<boolean> {
    const val = await AsyncStorage.getItem(NOTIF_STORAGE_KEY);
    return val !== 'false';
  }

  /**
   * Toggle daily notification on or off
   */
  static async setEnabled(enabled: boolean): Promise<boolean> {
    await AsyncStorage.setItem(NOTIF_STORAGE_KEY, enabled ? 'true' : 'false');
    if (enabled) {
      const granted = await this.requestPermissions();
      if (granted) {
        await this.scheduleDailyRecap(20, 0);
        return true;
      }
      return false;
    } else {
      await this.cancelDailyRecap();
      return true;
    }
  }

  /**
   * Request push notification permissions
   */
  static async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      return finalStatus === 'granted';
    } catch (e) {
      console.warn('[NotificationService] Permission error:', e);
      return false;
    }
  }

  /**
   * Schedule recurring daily notification at 8:00 PM (hour: 20, minute: 0)
   */
  static async scheduleDailyRecap(hour: number = 20, minute: number = 0): Promise<void> {
    try {
      // Cancel previous schedule to prevent duplicates
      await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIF_ID).catch(() => {});

      await Notifications.scheduleNotificationAsync({
        identifier: DAILY_NOTIF_ID,
        content: {
          title: 'Your DayDump is ready 🎞️',
          body: 'Review 6 curated shots from today before heading to bed.',
          sound: 'default',
          data: { screen: 'today_dump' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: 'daily_dump_channel',
        },
      });
      console.log(`[NotificationService] Daily recap scheduled for ${hour}:${minute < 10 ? '0' : ''}${minute}`);
    } catch (e) {
      console.warn('[NotificationService] Failed to schedule daily recap:', e);
    }
  }

  /**
   * Cancel daily recap notification
   */
  static async cancelDailyRecap(): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIF_ID);
    } catch (e) {
      console.warn('[NotificationService] cancel error:', e);
    }
  }

  /**
   * Trigger an instant test notification for testing & demonstration
   */
  static async sendTestNotification(): Promise<void> {
    const granted = await this.requestPermissions();
    if (!granted) {
      throw new Error('Notification permission was not granted.');
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your DayDump is ready 🎞️',
        body: 'Review 6 curated shots from today before heading to bed.',
        sound: 'default',
      },
      trigger: null, // trigger immediately
    });
  }
}
