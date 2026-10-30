import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { firstRunToAsk, goToStep, pressLast } from '../../jest/app';
import { seedWorld } from '../../jest/world';

const ML = jest.requireMock('expo-media-library/legacy');
const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never', accessPrivileges: 'all' };
const denied = { status: 'denied', granted: false, canAskAgain: true, expires: 'never', accessPrivileges: 'none' };
const DONE = '@daydump_has_completed_onboarding';

beforeAll(() => seedWorld());
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  ML.requestPermissionsAsync.mockImplementation(async () => granted);
  ML.getPermissionsAsync.mockImplementation(async () => granted);
});

const toAsk = firstRunToAsk;

test('onboarding: a "no" to photos is asked once (even double-tapped), Home offers it again, and a grant in Settings is picked up on return', async () => {
  ML.requestPermissionsAsync.mockImplementation(async () => denied);
  ML.getPermissionsAsync.mockImplementation(async () => denied);
  const allow = await toAsk();
  fireEvent.press(allow);
  await fireEvent.press(allow);
  await pressLast('Continue without photos');
  await goToStep('30'); // the questions in between need no photos
  await pressLast('Open Discover');

  expect(await screen.findByText('Let PicDump see your photos', {}, { timeout: 10000 })).toBeTruthy();
  expect(ML.requestPermissionsAsync).toHaveBeenCalledTimes(1); // no second system dialog on the way to Home
  expect(await AsyncStorage.getItem(DONE)).toBe('true');

  // Home's button: Android still shows its dialog (canAskAgain), so it asks there rather than sending to Settings
  await fireEvent.press(screen.getByText('Allow photos'));
  expect(ML.requestPermissionsAsync).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Let PicDump see your photos')).toBeTruthy();

  // allowed in Settings meanwhile, then back in front: no dialog, the no-access note goes
  ML.getPermissionsAsync.mockImplementation(async () => granted);
  ML.requestPermissionsAsync.mockImplementation(async () => granted);
  const subs = (AppState.addEventListener as jest.Mock).mock.calls.filter(([e]) => e === 'change').map(([, f]) => f);
  await act(async () => { subs.forEach((f) => f('active')); });
  await waitFor(() => expect(screen.queryByText('Let PicDump see your photos')).toBeNull());
}, 30000);
