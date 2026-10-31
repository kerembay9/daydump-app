import { act, fireEvent, screen } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { bootApp, settle } from '../../jest/app';
import { burst, byId, defaultLibrary, photo, seedWorld, world } from '../../jest/world';
import { ClipEmbedder } from '../../modules/clip-embedder';
import { DIM } from '../../src/services/index/vectors';
import { buildRounds, swapKeeper, type TPhoto } from '../../src/services/tidy/rules';

const trash = ClipEmbedder!.trash as jest.Mock;
beforeEach(() => trash.mockClear());

const openTidy = async () => {
  await bootApp('/tidy');
  const start = await screen.findByRole('button', { name: /Start Tidy|Scan again/ }, { timeout: 10000 }).catch(() => null);
  if (start) await fireEvent.press(start);
};
const swipe = (x: number) => act(async () => {
  fireGestureHandler(getByGestureTestId('tidy-swipe'), [{ state: State.BEGAN, translationX: 0 }, { state: State.ACTIVE, translationX: x / 2 }, { state: State.END, translationX: x }]);
});
const layDeck = () => fireEvent(screen.getByTestId('tidy-deck'), 'layout', { nativeEvent: { layout: { width: 320, height: 420 } } });

test('Tidy swipe: the first open teaches the swipe; a toggle shows the keeper; swipe and buttons mark; swap the keeper; the round asks before anything moves', async () => {
  const takes = burst(new Date(2025, 5, 1, 12), 4, [22]);
  seedWorld([...defaultLibrary(), ...takes]);
  // take 3 is the sharp one
  for (const p of takes) world.tidy.stats[p.id] = { b: 120, sd: 50, lap: p === takes[2] ? 400 : 60, hi: 0.01, lo: 0.01, finger: false, faces: [] };
  await openTidy();
  await fireEvent.press(await screen.findByRole('button', { name: /^Same shot/ }, { timeout: 20000 }));

  await screen.findByRole('button', { name: 'The keeper' });
  expect(await AsyncStorage.getItem('tidy.swipeHint')).toBeNull();
  await layDeck();
  await settle();
  expect(await AsyncStorage.getItem('tidy.swipeHint')).toBe('1');

  // the miss is on the photo and in a chip; only what differs shows
  expect(screen.getByText('1 of 3')).toBeTruthy();
  expect(screen.getAllByText('Less sharp')).toHaveLength(2);
  expect(screen.queryByText('Full resolution')).toBeNull();
  // the keeper has no marks; a decision goes back to this one
  await fireEvent.press(screen.getByRole('button', { name: 'The keeper' }));
  expect(screen.getAllByText('Less sharp')).toHaveLength(1);
  await fireEvent.press(screen.getByRole('button', { name: 'This one' }));
  expect(screen.getAllByText('Less sharp')).toHaveLength(2);

  // a short drag is nothing; a long one left marks it
  await swipe(-40);
  await settle();
  expect(screen.getByText('1 of 3')).toBeTruthy();
  await swipe(-400);
  expect(await screen.findByText('2 of 3')).toBeTruthy();
  // Keep, Undo, Keep
  await fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
  expect(await screen.findByText('3 of 3')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByText('2 of 3')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
  expect(await screen.findByText('3 of 3')).toBeTruthy();

  // the last take becomes the keeper, the sharp one comes up for judging instead
  await fireEvent.press(screen.getByRole('button', { name: 'Keep this one instead' }));
  expect(screen.getByText('3 of 3')).toBeTruthy();
  expect(screen.getByText('Sharper')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Trash' }));

  // are you sure: nothing has moved, and one is rescued
  expect(await screen.findByText('Are you sure?')).toBeTruthy();
  expect(screen.getByText(/^2 to Trash · 1 kept/)).toBeTruthy();
  expect(trash).not.toHaveBeenCalled();
  await fireEvent.press(screen.getAllByRole('button', { name: /, Trash$/ })[0]);
  expect(await screen.findByText(/^1 to Trash · 2 kept/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /^Move 1 to Trash/ }));
  expect(await screen.findByText('Moved 1 to Trash', {}, { timeout: 10000 })).toBeTruthy();
  expect(trash).toHaveBeenCalledTimes(1);
  expect([...trash.mock.calls[0][0]]).toEqual([takes[2].id]);
  expect(byId(takes[3].id)).toBeTruthy();
  expect(screen.queryByText('Videos: coming later')).toBeNull();
}, 60000);

test('Tidy swipe: every 16 the round asks; a move carries on to the next round and counts as one move', async () => {
  const takes = burst(new Date(2025, 5, 1, 12), 18, [22]);
  seedWorld([...defaultLibrary(), ...takes]);
  await openTidy();
  await fireEvent.press(await screen.findByRole('button', { name: /^Same shot/ }, { timeout: 20000 }));
  expect(await screen.findByText('Round 1 of 2 ·')).toBeTruthy();
  expect(screen.getByText('1 of 16')).toBeTruthy();
  await layDeck();
  for (let i = 1; i <= 16; i++) {
    await screen.findByText(`${i} of 16`);
    await fireEvent.press(screen.getByRole('button', { name: 'Trash' }));
  }
  expect(await screen.findByText('Round 1 of 2: are you sure?')).toBeTruthy();
  expect(trash).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: /^Move 16 to Trash/ }));
  expect(await screen.findByText('Round 2 of 2 ·', {}, { timeout: 10000 })).toBeTruthy();
  expect(trash).toHaveBeenCalledTimes(1);
  expect(screen.getByText('1 of 1')).toBeTruthy();
  await fireEvent.press(await screen.findByRole('button', { name: 'Trash' }));
  await fireEvent.press(await screen.findByRole('button', { name: /^Move 1 to Trash/ }));
  expect(await screen.findByText('Moved 17 to Trash', {}, { timeout: 10000 })).toBeTruthy();
}, 60000);

test('Tidy swipe: a locked photo asks first; leaving with marks asks too', async () => {
  // from the last 2 days: locked
  const takes = burst(new Date(Date.now() - 3600000), 3, [22]);
  seedWorld([...defaultLibrary(), ...takes]);
  await openTidy();
  await fireEvent.press(await screen.findByRole('button', { name: /^Same shot/ }, { timeout: 20000 }));
  await screen.findByRole('button', { name: 'Trash' });
  await layDeck();
  await swipe(-400);
  expect(await screen.findByText(/Trash anyway\?$/)).toBeTruthy();
  expect(screen.getByText('1 of 2')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Trash anyway' }));
  expect(await screen.findByText('2 of 2')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(await screen.findByText('Leave this round?')).toBeTruthy();
  expect(trash).not.toHaveBeenCalled();
}, 60000);

test('Tidy swipe: an exact copy says which folder stays and never comes up itself', async () => {
  const a = photo(new Date(2025, 6, 1, 9), [7]), b = photo(new Date(2025, 6, 2, 9), [7], undefined, false);
  seedWorld([...defaultLibrary(), a, b]);
  world.tidy.hash[a.id] = world.tidy.hash[b.id] = 'same-bytes';
  await openTidy();
  await fireEvent.press(await screen.findByRole('button', { name: /^Exact copies/ }, { timeout: 20000 }));
  expect(await screen.findByText('Same file')).toBeTruthy();
  expect(screen.getByText('1 of 1')).toBeTruthy();
  expect(screen.getByText(/^In (Camera|Pictures)$/)).toBeTruthy();
  expect(screen.getByText(/^Keeps the one in (Camera|Pictures)$/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Trash' }));
  expect(await screen.findByText(/^1 to Trash · 0 kept/)).toBeTruthy();
}, 60000);

test('buildRounds: look-alikes share a round, a take set stays whole, swapKeeper loses no photo', () => {
  const ph = (id: string, vi: number) => ({ id, vi }) as TPhoto;
  // 40 singles, odd and even rows look alike
  const vecs = new Float32Array(52 * DIM);
  for (let i = 0; i < 52; i++) vecs[i * DIM + (i % 2)] = 1;
  const single = Array.from({ length: 40 }, (_, i) => ({ p: ph(`s${i}`, i) }));
  const rounds = buildRounds(single, vecs);
  expect(rounds.map((r) => r.length)).toEqual([16, 16, 8]);
  for (const r of rounds.slice(0, 2)) expect(new Set(r.map((c) => c.p.vi % 2)).size).toBe(1);
  // a set of 4 that doesn't fit the first round goes whole to a later one; order inside a round is deck order
  const mixed = [...Array.from({ length: 14 }, (_, i) => ({ p: ph(`a${i}`, i * 2) })), ...Array.from({ length: 4 }, (_, i) => ({ p: ph(`b${i}`, 40), set: 0 }))];
  const split = buildRounds(mixed, vecs);
  expect(split.map((r) => r.length)).toEqual([14, 4]);
  // takes beyond 16 spill over
  expect(buildRounds(Array.from({ length: 17 }, (_, i) => ({ p: ph(`t${i}`, 0), set: 1 })), vecs).map((r) => r.length)).toEqual([16, 1]);

  const s = swapKeeper([{ p: ph('a', 0), set: 0 }, { p: ph('b', 0), set: 0 }], [ph('k', 0)], 1);
  expect(s.keepers.map((p) => p.id)).toEqual(['b']);
  expect(s.cards.map((c) => c.p.id)).toEqual(['a', 'k']);
});
