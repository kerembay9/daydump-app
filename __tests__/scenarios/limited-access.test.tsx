import { AppState } from 'react-native';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld } from '../../jest/world';

const ML = jest.requireMock('expo-media-library/legacy');
const access = (accessPrivileges: 'all' | 'limited') =>
  ({ status: accessPrivileges === 'all' ? 'granted' : 'denied', granted: accessPrivileges === 'all', canAskAgain: true, expires: 'never', accessPrivileges });

beforeAll(() => seedWorld());

test('Android 14 "Select photos": Home says PicDump only sees the picked photos, "Allow all photos" asks again, and "Allow all" in Settings clears the note', async () => {
  ML.requestPermissionsAsync.mockImplementation(async () => access('limited'));
  ML.getPermissionsAsync.mockImplementation(async () => access('limited'));
  await bootApp('/');

  expect(await screen.findByText('PicDump only sees the photos you picked', {}, { timeout: 10000 })).toBeTruthy();
  const asked = ML.requestPermissionsAsync.mock.calls.length;
  await fireEvent.press(screen.getByText('Allow all photos'));
  expect(ML.requestPermissionsAsync).toHaveBeenCalledTimes(asked + 1); // Android's dialog again, with "Allow all"

  // "Allow all" picked in Settings meanwhile, then back in front
  ML.getPermissionsAsync.mockImplementation(async () => access('all'));
  const subs = (AppState.addEventListener as jest.Mock).mock.calls.filter(([e]) => e === 'change').map(([, f]) => f);
  await act(async () => { subs.forEach((f) => f('active')); });
  await waitFor(() => expect(screen.queryByText('PicDump only sees the photos you picked')).toBeNull());
}, 30000);
