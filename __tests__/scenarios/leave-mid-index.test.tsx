import { act, screen } from 'expo-router/testing-library';
import { AppState } from 'react-native';
import { bootApp, settle } from '../../jest/app';
import { byUri, defaultLibrary, embed, photo, photoVec, seedWorld } from '../../jest/world';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { resetIndex } from '../../src/services/index/photoIndex';

// Leaving while the first index runs (home button, or the app killed), then back: Discover keeps "Building your dumps…"
// and never says "No dumps yet" while it lists the library and reads the first batch again.

let state = 'active';
Object.defineProperty(AppState, 'currentState', { get: () => state, configurable: true });

/** Embeds pass until `open` more batches have; the rest wait for release(). */
let done = 0;
let open = Infinity;
let release = () => {};
let gate = Promise.resolve();
const hold = (n: number) => { open = done + n; gate = new Promise((r) => (release = () => { open = Infinity; r(); })); };
jest.spyOn(ClipEmbedder!, 'embedImages').mockImplementation(async (uris) => {
  if (done >= open) await gate;
  done++;
  return embed(uris.map((u) => photoVec(byUri(u)!)));
});

const back = async () => {
  state = 'active';
  const subs = (AppState.addEventListener as jest.Mock).mock.calls.filter(([e]) => e === 'change').map(([, f]) => f);
  await act(async () => { subs.forEach((f) => f('active')); });
};
/** Mid re-read: the strip and "Building", never "No dumps yet". */
const building = async () => {
  await settle(2000);
  expect(screen.queryByText('No dumps yet')).toBeNull();
  expect(screen.getByText('Building your dumps…')).toBeTruthy();
};
const dumpsShow = () => screen.findByLabelText('Preview A week in Seattle', {}, { timeout: 10000 });

/**
 * 400 screenshots newer than the default library (no story: Include screenshots is off), so 3 batches of 128 make no
 * dump. Nothing in DCIM/Camera, which reads first: newest first throughout.
 */
const library = () => [
  ...Array.from({ length: 400 }, (_, i) => {
    const p = photo(new Date(2026, 0, 1, i), []);
    return { ...p, uri: `file:///storage/emulated/0/Pictures/Screenshots/IMG_${p.id}.png` };
  }),
  ...defaultLibrary().map((p) => ({ ...p, uri: p.uri.replace('DCIM/Camera', 'Pictures') })),
];

beforeEach(async () => {
  seedWorld(library());
  await resetIndex();
  state = 'active';
  open = Infinity;
});

test('home button before the first batch, then back', async () => {
  state = 'background'; // the indexer hands every photo to the background worker before its first batch
  await bootApp('/');
  await settle(3000);

  hold(0);
  await back();
  await building();
  release();
  expect(await dumpsShow()).toBeTruthy();
}, 30000);

test('indexing on screen, home button mid-run, then back', async () => {
  hold(2);
  await bootApp('/');
  expect(await screen.findByText(/^Reading your library… 256\/477$/, {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByText('Building your dumps…')).toBeTruthy();

  // home: the third batch (already started) ends, the fourth finds the app away and hands the rest to the background worker
  state = 'background';
  release();
  await settle(3000);

  hold(0);
  await back();
  await building();
  release();
  expect(await dumpsShow()).toBeTruthy();
}, 30000);

test('indexing on screen, app killed mid-run, then opened again', async () => {
  hold(2);
  await bootApp('/');
  expect(await screen.findByText(/^Reading your library… 256\/477$/, {}, { timeout: 10000 })).toBeTruthy();
  state = 'background';
  release();
  await settle(3000);
  screen.unmount();

  // cold start: 384 screenshots in the index, no dump from them yet
  state = 'active';
  hold(0);
  await bootApp('/');
  await building();
  release();
  expect(await dumpsShow()).toBeTruthy();
}, 30000);
