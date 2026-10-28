import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClipEmbedder } from '../../modules/clip-embedder';

const NOTIF_STORAGE_KEY = '@daydump_daily_notification_enabled';
const DAILY_NOTIF_ID = 'daydump_daily_recap_8pm';
const WEEKLY_NOTIF_ID = 'daydump_weekly_recap_sunday';
const WEEK = { title: 'Your week in one dump 🎞️', body: 'Your photos from this week, ready to look through.', sound: 'default' };

type NotificationsType = typeof import('expo-notifications');

let cachedNotifications: NotificationsType | null | undefined;

function getNotifications(): NotificationsType | null {
  if (cachedNotifications !== undefined) {
    return cachedNotifications;
  }

  // Expo Go on Android removed native notification modules (e.g. ExpoTopicSubscriptionModule)
  if (
    isRunningInExpoGo() ||
    (Platform.OS === 'android' && !requireOptionalNativeModule('ExpoTopicSubscriptionModule'))
  ) {
    cachedNotifications = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as NotificationsType;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    cachedNotifications = Notifications;
    return Notifications;
  } catch (e) {
    console.warn('[NotificationService] Notifications module unavailable:', e);
    cachedNotifications = null;
    return null;
  }
}

export class NotificationService {
  /**
   * Initialize notification channels (Android) and register default 8:00 PM schedule
   */
  static async init(): Promise<void> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('daily_dump_channel', {
          name: 'Daily Dump Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          // no `sound`: a channel's sound is a custom file name ('default' raised a LogBox); omitted = system default
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF9500',
        });
      }

      // Never asks: onboarding's notifications step does. Not chosen yet but already allowed: on, without a prompt.
      const stored = await AsyncStorage.getItem(NOTIF_STORAGE_KEY);
      if (stored === null) {
        if ((await Notifications.getPermissionsAsync()).status === 'granted') await this.setEnabled(true);
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
    if (enabled) {
      // stored only once permission is there, so a refused ask doesn't read back as "on"
      const granted = await this.requestPermissions();
      await AsyncStorage.setItem(NOTIF_STORAGE_KEY, granted ? 'true' : 'false');
      if (granted) {
        await this.scheduleDailyRecap(20, 0);
        return true;
      }
      return false;
    } else {
      await AsyncStorage.setItem(NOTIF_STORAGE_KEY, 'false');
      await this.cancelDailyRecap();
      return true;
    }
  }

  /**
   * Request push notification permissions
   */
  static async requestPermissions(): Promise<boolean> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) return false;

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
   * Schedule recurring daily notification at 8:00 PM (hour: 20, minute: 0), and the week's on Sundays at noon
   */
  static async scheduleDailyRecap(hour: number = 20, minute: number = 0): Promise<void> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) return;

      // Cancel previous schedule to prevent duplicates
      await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIF_ID).catch(() => {});
      await Notifications.cancelScheduledNotificationAsync(WEEKLY_NOTIF_ID).catch(() => {});

      // Android: native jobs (daily + Sunday), so the recap can show the dump's cover photo (expo-notifications has no local images there)
      if (ClipEmbedder) {
        await ClipEmbedder.scheduleDailyRecap();
        return;
      }

      await Notifications.scheduleNotificationAsync({
        identifier: DAILY_NOTIF_ID,
        content: {
          title: 'Your PicDump is ready 🎞️',
          body: 'Review 6 curated shots from today before heading to bed.',
          sound: 'default',
          data: { url: '/preview/today' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: 'daily_dump_channel',
        },
      });
      // ponytail: generic text and no link, the week's story id isn't known ahead; Android's native job has both
      await Notifications.scheduleNotificationAsync({
        identifier: WEEKLY_NOTIF_ID,
        content: WEEK,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 12, minute: 0, channelId: 'daily_dump_channel' }, // 1 = Sunday
      });
      console.log(`[NotificationService] Daily recap scheduled for ${hour}:${minute < 10 ? '0' : ''}${minute}`);
    } catch (e) {
      console.warn('[NotificationService] Failed to schedule daily recap:', e);
    }
  }

  /**
   * Calls onOpen with the route a tapped notification links to: once for the tap that cold-started the app, then for
   * every later tap. Returns the unsubscribe.
   */
  static onOpen(onOpen: (url: string) => void): () => void {
    const Notifications = getNotifications();
    if (!Notifications) return () => {};
    const handle = (r: import('expo-notifications').NotificationResponse | null) => {
      const url = r?.notification.request.content.data?.url;
      if (typeof url === 'string') onOpen(url);
    };
    handle(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }

  /**
   * Cancel daily recap notification
   */
  static async cancelDailyRecap(): Promise<void> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) return;

      await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIF_ID);
      await Notifications.cancelScheduledNotificationAsync(WEEKLY_NOTIF_ID);
      await ClipEmbedder?.cancelDailyRecap();
    } catch (e) {
      console.warn('[NotificationService] cancel error:', e);
    }
  }

  /**
   * Trigger an instant test notification for testing & demonstration
   */
  static async sendTestNotification(week = false): Promise<void> {
    const Notifications = getNotifications();
    if (!Notifications) {
      throw new Error('Notifications require a native build and are not supported in Expo Go.');
    }

    const granted = await this.requestPermissions();
    if (!granted) {
      throw new Error('Notification permission was not granted.');
    }
    if (ClipEmbedder) return week ? ClipEmbedder.postWeekRecap() : ClipEmbedder.postDailyRecap();

    await Notifications.scheduleNotificationAsync({
      content: week ? WEEK : {
        title: 'Your PicDump is ready 🎞️',
        body: 'Review 6 curated shots from today before heading to bed.',
        sound: 'default',
      },
      trigger: null, // trigger immediately
    });
  }
}
