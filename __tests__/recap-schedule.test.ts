import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationService } from '../src/services/notificationService';

// notificationService only loads expo-notifications outside Expo Go (jest-expo says it is) with this native module there
jest.mock('expo', () => ({ ...jest.requireActual('expo'), isRunningInExpoGo: () => false }));
(globalThis as any).expo.modules.ExpoTopicSubscriptionModule = {};
jest.mock('expo-notifications', () => ({
  setNotificationHandler: () => {},
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly' },
}));
// null = iOS / no native module: expo-notifications' own triggers; set = Android's native jobs (DailyRecap.kt)
jest.mock('../modules/clip-embedder', () => ({ ClipEmbedder: null }));
const mockNative: { ClipEmbedder: any } = jest.requireMock('../modules/clip-embedder');
const N = jest.requireMock('expo-notifications');

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockNative.ClipEmbedder = null;
});

test('recap on: daily 8 PM and Sunday noon; off: both cancelled', async () => {
  expect(await NotificationService.setEnabled(true)).toBe(true);
  const triggers = N.scheduleNotificationAsync.mock.calls.map(([r]: any[]) => [r.identifier, r.trigger]);
  expect(triggers).toEqual([
    ['daydump_daily_recap_8pm', expect.objectContaining({ type: 'daily', hour: 20, minute: 0 })],
    ['daydump_weekly_recap_sunday', expect.objectContaining({ type: 'weekly', weekday: 1, hour: 12, minute: 0 })],
  ]);

  N.cancelScheduledNotificationAsync.mockClear();
  await NotificationService.setEnabled(false);
  expect(N.cancelScheduledNotificationAsync.mock.calls.map(([id]: string[]) => id).sort())
    .toEqual(['daydump_daily_recap_8pm', 'daydump_weekly_recap_sunday']);
});

test('Android: the one native schedule / cancel covers both recaps', async () => {
  mockNative.ClipEmbedder = { scheduleDailyRecap: jest.fn(async () => {}), cancelDailyRecap: jest.fn(async () => {}) };
  await NotificationService.setEnabled(true);
  expect(mockNative.ClipEmbedder.scheduleDailyRecap).toHaveBeenCalledTimes(1);
  expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  await NotificationService.setEnabled(false);
  expect(mockNative.ClipEmbedder.cancelDailyRecap).toHaveBeenCalledTimes(1);
});
