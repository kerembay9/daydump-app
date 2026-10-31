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

test('Home: with photo access revoked later it offers the permission again, and a grant in Settings is picked up on return', async () => {
  inSettings(denied);
  await bootApp('/');
  expect(await screen.findByText('Let PicDump see your photos', {}, { timeout: 10000 })).toBeTruthy();
  const asked = ML.requestPermissionsAsync.mock.calls.length; // the launch asked once already
  await fireEvent.press(screen.getByText('Allow photos'));
  expect(ML.requestPermissionsAsync).toHaveBeenCalledTimes(asked + 1);

  inSettings(granted);
  await returnToApp();
  await waitFor(() => expect(screen.queryByText('Let PicDump see your photos')).toBeNull());
}, 30000);
