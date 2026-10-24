import path from 'path';
import { Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
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

/** First run up to the notifications step: both slides, then photo access (the step comes right after, before the profile step). */
async function toNotifyStep() {
  await renderRouter(path.resolve(__dirname, '../../src/app'), { initialUrl: '/' });
  const hook = await screen.findByText('Turn camera roll chaos into dumps', {}, { timeout: 10000 });
  let pager = hook;
  while (!pager.props.onScroll) pager = pager.parent!;
  await fireEvent.scroll(pager, { nativeEvent: { contentOffset: { x: Dimensions.get('window').width } } });
  await fireEvent.press(await screen.findByText('Allow photos & continue'));
  expect(await screen.findByText('Your day, ready at 8 PM')).toBeTruthy();
  expect(screen.getByLabelText('Notification preview')).toBeTruthy();
  expect(screen.queryByText('Put yourself in your posts')).toBeNull();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled(); // nothing asked before the step
}

test('onboarding: Turn on asks for notifications and schedules the recap', async () => {
  await toNotifyStep();
  await fireEvent.press(screen.getByText('Turn on'));
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(await AsyncStorage.getItem(KEY)).toBe('true');
  expect((globalThis as any).expo.modules.ClipEmbedder.scheduleDailyRecap).toHaveBeenCalled();
  expect(await screen.findByText('Put yourself in your posts')).toBeTruthy(); // then the profile step
  expect(screen.queryByText('Your day, ready at 8 PM')).toBeNull();
}, 30000);

test('onboarding: Not now skips the ask, and init() never prompts', async () => {
  await toNotifyStep();
  await fireEvent.press(screen.getByText('Not now'));
  expect(await AsyncStorage.getItem(KEY)).toBe('false');
  expect(await screen.findByText('Put yourself in your posts')).toBeTruthy();
  expect(screen.queryByText('Your day, ready at 8 PM')).toBeNull();

  // nothing stored and not allowed (e.g. onboarding done on an older build): init still doesn't ask
  await AsyncStorage.removeItem(KEY);
  await NotificationService.init();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(KEY)).toBeNull();
}, 30000);
