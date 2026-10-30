import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp, firstRunToAsk, goToStep, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';

const ML = jest.requireMock('expo-media-library/legacy');
const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never', accessPrivileges: 'all' };
const SHOWN = '@daydump_first_dump_shown';

beforeAll(() => seedWorld());
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  ML.requestPermissionsAsync.mockImplementation(async () => granted);
  ML.getPermissionsAsync.mockImplementation(async () => granted);
});

test('first run: once onboarding closes the first dump prints as a booth strip, once', async () => {
  const allow = await firstRunToAsk();
  expect(screen.getByText('Let PicDump read your photos')).toBeTruthy();
  expect(screen.queryByText('Kept')).toBeNull(); // no counter pill
  expect(screen.queryByText(/Android settings/)).toBeNull(); // no footer line
  await fireEvent.press(allow);
  await goToStep('30');
  expect(screen.queryByLabelText(/^Your first dump/)).toBeNull(); // not under the onboarding
  await fireEvent.press(await screen.findByText('Open Discover'));

  const strip = await screen.findByLabelText(/^Your first dump: /, {}, { timeout: 10000 });
  expect(await AsyncStorage.getItem(SHOWN)).toBe('true');
  await fireEvent.press(strip); // a tap skips it
  await settle(1000);
  await waitFor(() => expect(screen.queryByLabelText(/^Your first dump/)).toBeNull());
}, 40000);

test('someone who already has dumps never sees the strip', async () => {
  await bootApp('/');
  await screen.findByLabelText(/^A week in Seattle, /, {}, { timeout: 10000 });
  await settle(100);
  expect(await AsyncStorage.getItem(SHOWN)).toBe('true');
  expect(screen.queryByLabelText(/^Your first dump/)).toBeNull();
}, 30000);
