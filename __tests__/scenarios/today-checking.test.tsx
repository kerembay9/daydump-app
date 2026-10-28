import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AppState } from 'react-native';
import { bootApp } from '../../jest/app';
import { byUri, defaultLibrary, embed, photo, photoVec, seedWorld, world } from '../../jest/world';
import { ClipEmbedder } from '../../modules/clip-embedder';

// Today is open, a sunset is shot in the camera, back to the app: the card says it's checking that photo until it's read and
// the card is redrawn, then "The sky" is done and the swap hint is back.
const now = new Date();
const at = (h: number, d = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, h);
const history = Array.from({ length: 10 }, (_, i) => [photo(at(12, i + 1), [0]), photo(at(19, i + 1), [9])]).flat();
beforeAll(() => seedWorld([...defaultLibrary(), ...history, photo(at(9), [0])]));

let release = () => {};
let gate = Promise.resolve();
jest.spyOn(ClipEmbedder!, 'embedImages').mockImplementation(async (uris) => {
  await gate;
  return embed(uris.map((u) => photoVec(byUri(u)!)));
});

test('Today: "Checking 1 new photo…" while a photo shot outside the app is read', async () => {
  const app = await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(/^Today: /, {}, { timeout: 10000 }));
  await waitFor(() => expect(app.getPathname()).toBe('/today'));
  expect(await screen.findByText(/^Tap an empty square to swap it, once a day$/)).toBeTruthy();
  expect(screen.queryByLabelText('The sky, done')).toBeNull();

  gate = new Promise((r) => (release = r));
  world.photos.unshift(photo(new Date(), [9]));
  const subs = (AppState.addEventListener as jest.Mock).mock.calls.filter(([e]) => e === 'change').map(([, f]) => f);
  await act(async () => { subs.forEach((f) => f('active')); });
  expect(await screen.findByText('Checking 1 new photo…')).toBeTruthy();

  release();
  expect(await screen.findByLabelText('The sky, done', {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.queryByText(/^Checking/)).toBeNull();
  expect(screen.getByText(/^Tap an empty square to swap it, once a day$/)).toBeTruthy();
}, 30000);
