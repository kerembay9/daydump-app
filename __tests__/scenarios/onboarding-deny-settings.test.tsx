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

test('onboarding: once Android stops asking the button opens Settings, and a grant there is picked up on return', async () => {
  inSettings({ ...denied, canAskAgain: false });
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  await fireEvent.press(await toAsk());
  expect(await screen.findByText('PicDump needs your photos')).toBeTruthy();
  await fireEvent.press(screen.getByText('Open settings'));
  expect(open).toHaveBeenCalledTimes(1);
  expect(ML.requestPermissionsAsync).toHaveBeenCalledTimes(1); // no second dialog: it can't show

  inSettings(granted);
  await returnToApp();
  expect(await screen.findByText('Looking through your library…', {}, { timeout: 10000 })).toBeTruthy();
}, 30000);
