import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { firstRunToAsk, goToStep } from '../../jest/app';
import { seedWorld } from '../../jest/world';

const ML = jest.requireMock('expo-media-library/legacy');
const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never', accessPrivileges: 'all' };
const DONE = '@daydump_has_completed_onboarding';

beforeAll(() => seedWorld());
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  ML.requestPermissionsAsync.mockImplementation(async () => granted);
  ML.getPermissionsAsync.mockImplementation(async () => granted);
});

const toAsk = firstRunToAsk;

test('onboarding: done is saved at the end, not at the photo grant (killed before the last screen, it shows again)', async () => {
  await fireEvent.press(await toAsk());
  await goToStep('26');
  expect(await screen.findByText('Your day at 8 PM, your week on Sunday.')).toBeTruthy();
  expect(await AsyncStorage.getItem(DONE)).toBeNull();

  await goToStep('30');
  await fireEvent.press(await screen.findByText('Open Discover'));
  await waitFor(async () => expect(await AsyncStorage.getItem(DONE)).toBe('true'));
}, 30000);
