import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';

beforeAll(() => seedWorld());

test('a Turkish search waits for its download, then also searches the English translation, silently', async () => {
  world.lang.device = 'tr';
  let release!: () => void;
  world.lang.gate = new Promise<void>((r) => { release = r; });
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  const search = screen.getByPlaceholderText('Search keyword, place, date...');

  await fireEvent.changeText(search, 'sunset');
  const sunsets = Number((await screen.findByText(/^Matches for "sunset"/)).props.children.match(/\((\d+)\)/)[1]);
  expect(sunsets).toBeGreaterThan(0);

  // Turkish isn't downloaded yet: says so, searches as typed
  await fireEvent.changeText(search, 'gün batımı');
  expect(await screen.findByText(/Turkish is still downloading \(about 30 MB\)/)).toBeTruthy();

  // the download lands: searched again with the translation, the note goes, no "Also searching" chip
  await act(async () => { release(); });
  await waitFor(() => expect(screen.queryByText(/still downloading/)).toBeNull());
  expect(await screen.findByText(`Matches for "gün batımı" (${sunsets})`)).toBeTruthy();
  expect(screen.queryByText(/Also searching/)).toBeNull();

  // emoji are searched by name too
  await fireEvent.changeText(search, '🌇');
  expect(await screen.findByText(`Matches for "🌇" (${sunsets})`)).toBeTruthy();
}, 30000);

test('Settings lists search languages with their download state; turning one off deletes it', async () => {
  world.lang.gate = Promise.resolve();
  await bootApp('/profile');
  await screen.findByText('Search languages', {}, { timeout: 10000 });
  expect(screen.getByText('English')).toBeTruthy();
  expect(screen.getByText('Built in')).toBeTruthy();
  expect(await screen.findByText('Ready')).toBeTruthy(); // Turkish, the phone's language

  await fireEvent.press(screen.getByText('Choose languages'));
  await fireEvent.press(await screen.findByRole('switch', { name: /German/ }));
  expect(await screen.findAllByText('Ready')).toHaveLength(2);
  expect(world.lang.downloaded).toContain('de');

  await fireEvent.press(screen.getByRole('switch', { name: /Turkish/ }));
  await screen.findByText('Turning one off deletes its download.');
  await act(async () => {});
  expect(world.lang.downloaded).not.toContain('tr');
  expect(world.lang.downloaded).toContain('de');
}, 30000);
