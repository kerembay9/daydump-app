import path from 'path';
import { Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
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

test('first run: both slides show their pictures, and once onboarding closes the first dump prints as a booth strip, once', async () => {
  await renderRouter(path.resolve(__dirname, '../../src/app'), { initialUrl: '/' });
  let pager = await screen.findByText('Turn camera roll chaos into dumps', {}, { timeout: 10000 });
  expect(screen.getByLabelText(/Photos sorting themselves/)).toBeTruthy();
  expect(screen.getByLabelText('Page 1 of 4')).toBeTruthy();
  expect(screen.queryByText('Kept')).toBeNull(); // no counter pill
  expect(screen.queryByText(/Android settings/)).toBeNull(); // no footer line
  while (!pager.props.onScroll) pager = pager.parent!;
  await fireEvent.scroll(pager, { nativeEvent: { contentOffset: { x: Dimensions.get('window').width } } });
  expect(screen.getByLabelText(/inside a lock; none reach the cloud/)).toBeTruthy();
  expect(screen.getByLabelText('Page 2 of 4')).toBeTruthy();
  expect(screen.queryByText(/Allow all/)).toBeNull();
  await fireEvent.press(await screen.findByText('Allow photos & continue'));
  await fireEvent.press(await screen.findByText('Not now'));
  expect(screen.queryByLabelText(/^Your first dump/)).toBeNull(); // not under the onboarding
  await fireEvent.press(await screen.findByText(/^Skip/));

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
