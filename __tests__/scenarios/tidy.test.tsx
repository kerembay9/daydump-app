import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { burst, byId, defaultLibrary, photo, seedWorld, world } from '../../jest/world';
import { ClipEmbedder } from '../../modules/clip-embedder';

const trash = ClipEmbedder!.trash as jest.Mock;

test('Tidy: 4 takes of one shot, a copy and a black frame; keep the best take, Trash the rest, start a dump from the keeper', async () => {
  // concept 22 is worth 0.5: not locked as "Looks like a moment"
  const takes = burst(new Date(2025, 5, 1, 12), 4, [22]);
  const copyA = photo(new Date(2025, 6, 1, 9), [7]), copyB = photo(new Date(2025, 6, 2, 9), [7]);
  const black = photo(new Date(2025, 6, 3, 23), [9]);
  seedWorld([...defaultLibrary(), ...takes, copyA, copyB, black]);
  world.tidy.hash[copyA.id] = world.tidy.hash[copyB.id] = 'same-bytes';
  world.tidy.stats[black.id] = { b: 4, sd: 2, lap: 1, hi: 0, lo: 0.95, finger: false, faces: [] };
  // take 3 is the sharp one: the others are soft
  for (const p of takes) world.tidy.stats[p.id] = { b: 120, sd: 50, lap: p === takes[2] ? 400 : 60, hi: 0.01, lo: 0.01, finger: false, faces: [] };

  const r = await bootApp('/tidy');
  await fireEvent.press(await screen.findByRole('button', { name: 'Start Tidy' }, { timeout: 10000 }));
  await screen.findByText('Same shot', {}, { timeout: 20000 });
  // 3 extra takes + the second copy + the black frame
  expect(screen.getByText('5')).toBeTruthy();
  expect(screen.getByText('duplicates and photos you don’t use')).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Exact copies, 2 · / })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Blurry & dark, 1/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Same shot, 1 set · 4 photos/ })).toBeTruthy();

  // the set: the sharp take is the keeper, the rest are marked
  await fireEvent.press(screen.getByRole('button', { name: /^Same shot/ }));
  expect(await screen.findByText(/4 takes of the same shot\. Kept the sharpest one\./)).toBeTruthy();
  // each other take says what happens to it, in words; tapping one keeps it instead
  expect(screen.getAllByRole('button', { name: /, Trash$/ })).toHaveLength(3);
  expect(screen.queryByText(/✓|✗/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: /^Keep 1 · Remove 3/ }));
  expect(await screen.findByText('That’s every set')).toBeTruthy();
  await fireEvent.press(screen.getAllByRole('button', { name: 'Move 3 to Trash' }).at(-1)!);
  expect(await screen.findByText('Move 3 photos to Trash?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Move to Trash' }));
  await settle();

  // Android's dialog got the three soft takes, never the keeper or anything else
  expect(trash).toHaveBeenCalledTimes(1);
  expect([...trash.mock.calls[0][0]].sort()).toEqual([takes[0], takes[1], takes[3]].map((p) => p.id).sort());
  expect(trash.mock.calls[0][1]).toBe(true);
  expect(byId(takes[2].id)).toBeTruthy();
  expect(byId(takes[0].id)).toBeUndefined();
  expect(await screen.findByText('Moved 3 to Trash', {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByText(/Kept 1 of 4\. Start a dump from these keepers\?/)).toBeTruthy();

  // the keeper starts a dump
  await fireEvent.press(screen.getByRole('button', { name: 'Start a dump' }));
  await settle();
  expect(r.getPathname()).toBe('/create');
}, 60000);

test('Tidy: Trash history restores a move', async () => {
  const takes = burst(new Date(2025, 5, 1, 12), 3, [22]);
  seedWorld([...defaultLibrary(), ...takes]);
  await bootApp('/tidy');
  const start = await screen.findByRole('button', { name: /Start Tidy|Scan again/ }, { timeout: 10000 }).catch(() => null);
  if (start) await fireEvent.press(start);
  await fireEvent.press(await screen.findByRole('button', { name: /^Same shot/ }, { timeout: 20000 }));
  await fireEvent.press(await screen.findByRole('button', { name: /^Keep 1 · Remove 2/ }));
  await fireEvent.press((await screen.findAllByRole('button', { name: 'Move 2 to Trash' })).at(-1)!);
  await fireEvent.press(await screen.findByRole('button', { name: 'Move to Trash' }));
  await screen.findByText('Moved 2 to Trash', {}, { timeout: 10000 });

  await fireEvent.press(screen.getByRole('button', { name: 'Trash history' }));
  expect(await screen.findByText(/^Today · 2 photos/)).toBeTruthy();
  expect(screen.getByText(/In Trash until/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /Restore/ }));
  await settle();
  expect(takes.every((p) => byId(p.id))).toBe(true);
}, 60000);
