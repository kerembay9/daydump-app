import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { firstRunToAsk, goToStep } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { NotificationService } from '../../src/services/notificationService';

// notificationService only loads expo-notifications outside Expo Go (jest-expo says it is) with this native module there
jest.mock('expo', () => ({ ...jest.requireActual('expo'), isRunningInExpoGo: () => false }));
(globalThis as any).expo.modules.ExpoTopicSubscriptionModule = {};
const perm = { status: 'undetermined' };
jest.mock('expo-notifications', () => ({
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => {},
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: jest.fn(async () => ({ ...perm })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  cancelScheduledNotificationAsync: async () => {},
  getLastNotificationResponse: () => null,
  clearLastNotificationResponse: () => {},
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
}));
const Notifications = jest.requireMock('expo-notifications');
const KEY = '@daydump_daily_notification_enabled';

beforeAll(() => seedWorld());
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

/** First run up to the reminders screen (26): photo access granted on 4, then straight there. */
async function toNotifyStep() {
  await fireEvent.press(await firstRunToAsk());
  await goToStep('26');
  expect(await screen.findByText('Your day at 8 PM, your week on Sunday.')).toBeTruthy();
  expect(screen.getByText('Your PicDump is ready 🎞️')).toBeTruthy(); // the notification mock
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled(); // nothing asked before the screen's button
}

test('onboarding: Turn on asks for notifications and schedules the recap', async () => {
  await toNotifyStep();
  await fireEvent.press(screen.getByText('Turn on'));
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(await AsyncStorage.getItem(KEY)).toBe('true');
  expect((globalThis as any).expo.modules.ClipEmbedder.scheduleDailyRecap).toHaveBeenCalled();
  expect(await screen.findByText('Try your first dump.')).toBeTruthy(); // then the first dump
}, 30000);

test('onboarding: Not now skips the ask, and init() never prompts', async () => {
  await toNotifyStep();
  await fireEvent.press(screen.getByText('Not now'));
  expect(await AsyncStorage.getItem(KEY)).toBe('false');
  expect(await screen.findByText('Try your first dump.')).toBeTruthy();

  // nothing stored and not allowed (e.g. onboarding done on an older build): init still doesn't ask
  await AsyncStorage.removeItem(KEY);
  await NotificationService.init();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(KEY)).toBeNull();
}, 30000);
