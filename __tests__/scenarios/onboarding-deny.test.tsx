import { AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { bootApp, firstRunToAsk } from '../../jest/app';
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

const inSettings = (to: unknown) => {
  ML.getPermissionsAsync.mockImplementation(async () => to);
  ML.requestPermissionsAsync.mockImplementation(async () => to);
};
const returnToApp = async () => {
  const subs = (AppState.addEventListener as jest.Mock).mock.calls.filter(([e]) => e === 'change').map(([, f]) => f);
  await act(async () => { subs.forEach((f) => f('active')); });
};

test('onboarding: a "no" keeps the photo question (asked once even double-tapped); a yes on the next ask moves on', async () => {
  inSettings(denied);
  const allow = await toAsk();
  fireEvent.press(allow);
  await fireEvent.press(allow);
  expect(await screen.findByText('PicDump needs your photos')).toBeTruthy();
  expect(ML.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(await AsyncStorage.getItem(DONE)).toBeNull();

  // the dialog shows again and this time they allow
  ML.requestPermissionsAsync.mockImplementation(async () => { ML.getPermissionsAsync.mockImplementation(async () => granted); return granted; });
  await fireEvent.press(screen.getByText('Allow photos and continue'));
  expect(ML.requestPermissionsAsync).toHaveBeenCalledTimes(2);
  expect(await screen.findByText('Looking through your library…', {}, { timeout: 10000 })).toBeTruthy();
}, 30000);
