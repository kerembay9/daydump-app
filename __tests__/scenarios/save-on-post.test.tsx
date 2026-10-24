import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import * as MediaLibrary from 'expo-media-library/legacy';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { getProfile, setProfile } from '../../src/services/profile';

const LONG = 'An autumn of golden retriever puppy splashing through the shallow waves';

beforeAll(() => seedWorld());

test('Profile: the gallery toggle is on by default and saves when tapped', async () => {
  await bootApp('/profile');
  const row = await screen.findByRole('switch', { name: /Posting also saves to gallery/ });
  expect(row.props.accessibilityState).toMatchObject({ checked: true });
  await fireEvent.press(row);
  await waitFor(() => expect(screen.getByRole('switch', { name: /Posting also saves to gallery/ }).props.accessibilityState).toMatchObject({ checked: false }));
  await settle();
  expect((await getProfile()).saveOnPost).toBe(false);
  await setProfile({ saveOnPost: true });
}, 30000);

test('"Posting also saves to gallery" off: Post shares but writes nothing to the album', async () => {
  await setProfile({ saveOnPost: false });
  const saves = MediaLibrary.createAssetAsync as jest.Mock, albums = MediaLibrary.createAlbumAsync as jest.Mock;
  const before = saves.mock.calls.length + albums.mock.calls.length;
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, 7 photos · Sep 22–Oct 22, 2025`, {}, { timeout: 10000 }));
  await fireEvent.press(await screen.findByLabelText('Post on Instagram or TikTok'));
  await fireEvent.press(await screen.findByLabelText('Instagram post'));
  expect(await screen.findByText('Posted to Instagram')).toBeTruthy();
  expect(screen.queryByText(/saved to the DayDump album/)).toBeNull();
  expect(saves.mock.calls.length + albums.mock.calls.length).toBe(before);
  await setProfile({ saveOnPost: true });
}, 30000);
