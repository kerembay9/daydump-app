import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { burst, byId, defaultLibrary, photo, seedWorld, world } from '../../jest/world';
import { ClipEmbedder } from '../../modules/clip-embedder';

// Tidy for a free user: scanning, every pile, the counts and the sets are free; moving to Trash is Pro. Undo, restore and
// Trash history never are (a lapsed user's photos are never held hostage).
const trash = ClipEmbedder!.trash as jest.Mock;
const PAYWALL = 'Clear the clutter.';
const rc = jest.requireMock('react-native-purchases').default as { getCustomerInfo: jest.Mock; addCustomerInfoUpdateListener: jest.Mock; setAttributes: jest.Mock };

beforeEach(async () => {
  trash.mockClear();
  await AsyncStorage.removeItem('@picdump_pro_known');
  await AsyncStorage.setItem('@picdump_first_paywall_shown', '1');
});
afterAll(() => { world.pro = true; });

/** Starts the scan (or a rescan: Tidy's state outlives a boot in one file) and waits for the piles. */
async function scan() {
  const start = await screen.findByRole('button', { name: /Start Tidy|Scan again/ }, { timeout: 10000 }).catch(() => null);
  if (start) await fireEvent.press(start);
  await screen.findByText('Same shot', {}, { timeout: 20000 });
}

/** Opens a pile's grid: a pile opens as the swipe deck, and its Grid pill leads to the grid. */
async function openGrid(pile: RegExp) {
  await fireEvent.press(await screen.findByRole('button', { name: pile }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Grid' }));
}

test('free: Tidy finds and shows every pile, but moving to Trash opens the paywall', async () => {
  const takes = burst(new Date(2025, 5, 1, 12), 4, [22]);
  const copyA = photo(new Date(2025, 6, 1, 9), [7]), copyB = photo(new Date(2025, 6, 2, 9), [7]);
  seedWorld([...defaultLibrary(), ...takes, copyA, copyB]);
  world.tidy.hash[copyA.id] = world.tidy.hash[copyB.id] = 'same-bytes';
  world.pro = false;

  await bootApp('/tidy');
  await scan();
  // counts and piles, as for Pro
  expect(screen.getByText(/photos could go · about/)).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Exact copies, 2 · / })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Same shot, 1 set · 4 photos/ })).toBeTruthy();

  // the set can be reviewed and decided; Move asks for Pro, and nothing goes to Trash
  await openGrid(/^Same shot/);
  expect(await screen.findByText(/4 takes of the same shot\./)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /^Keep 1 · Remove 3/ }));
  expect(await screen.findByText('That’s every set')).toBeTruthy();
  await fireEvent.press(screen.getAllByRole('button', { name: 'Move 3 to Trash' }).at(-1)!);
  expect(await screen.findByText(PAYWALL)).toBeTruthy();
  expect(screen.queryByText('Move 3 photos to Trash?')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Close paywall'));
  await settle();
  expect(trash).not.toHaveBeenCalled();
  expect(takes.every((p) => byId(p.id))).toBe(true);

  // a review pile too
  await fireEvent.press(screen.getByLabelText('Back'));
  await openGrid(/^Exact copies/);
  await fireEvent.press(await screen.findByRole('button', { name: 'Move 1 to Trash' }));
  expect(await screen.findByText(PAYWALL)).toBeTruthy();
  await settle();
  expect(trash).not.toHaveBeenCalled();
  expect(byId(copyB.id)).toBeTruthy();
}, 60000);

test('free: the swipe deck decides for free, but its Move opens the paywall', async () => {
  const takes = burst(new Date(2025, 5, 1, 12), 3, [22]);
  seedWorld([...defaultLibrary(), ...takes]);
  world.pro = false;

  await bootApp('/tidy');
  await scan();
  await fireEvent.press(screen.getByRole('button', { name: /^Same shot/ }));
  fireEvent(await screen.findByTestId('tidy-deck'), 'layout', { nativeEvent: { layout: { width: 320, height: 420 } } });
  await fireEvent.press(await screen.findByRole('button', { name: 'Trash' }));
  await screen.findByText('2 of 2');
  await fireEvent.press(screen.getByRole('button', { name: 'Trash' }));
  expect(await screen.findByText('Are you sure?')).toBeTruthy();

  const move = screen.getByRole('button', { name: /^Move 2 to Trash/ });
  expect(move.props.accessibilityHint).toBe('PicDump Pro');
  await fireEvent.press(move);
  expect(await screen.findByText(PAYWALL)).toBeTruthy();
  await settle();
  expect(trash).not.toHaveBeenCalled();
  expect(takes.every((p) => byId(p.id))).toBe(true);
}, 60000);

test('Pro lapsing while a pile is open: Move opens the paywall (source tidy), nothing is trashed', async () => {
  const takes = burst(new Date(2025, 5, 1, 12), 3, [22]);
  const copyA = photo(new Date(2025, 6, 1, 9), [7]), copyB = photo(new Date(2025, 6, 2, 9), [7]);
  seedWorld([...defaultLibrary(), ...takes, copyA, copyB]);
  world.tidy.hash[copyA.id] = world.tidy.hash[copyB.id] = 'same-bytes';
  world.pro = true;

  await bootApp('/tidy');
  await scan();
  await openGrid(/^Exact copies/);
  const move = await screen.findByRole('button', { name: 'Move 1 to Trash' });
  expect(move.props.accessibilityHint).toBeUndefined();

  // RevenueCat's listener: the subscription ended
  world.pro = false;
  const info = await rc.getCustomerInfo();
  await act(async () => { rc.addCustomerInfoUpdateListener.mock.lastCall![0](info); });
  await settle();
  rc.setAttributes.mockClear();
  expect(screen.getByRole('button', { name: 'Move 1 to Trash' }).props.accessibilityHint).toBe('PicDump Pro');
  await fireEvent.press(screen.getByRole('button', { name: 'Move 1 to Trash' }));
  expect(await screen.findByText(PAYWALL)).toBeTruthy();
  expect(rc.setAttributes).toHaveBeenCalledWith({ paywall_source: 'tidy' });
  expect(screen.queryByText('Move 1 photo to Trash?')).toBeNull();
  await settle();
  expect(trash).not.toHaveBeenCalled();
  expect(byId(copyB.id)).toBeTruthy();
}, 60000);

test('Pro moves to Trash; after Pro lapses, Undo still restores', async () => {
  const takes = burst(new Date(2025, 5, 1, 12), 3, [22]);
  seedWorld([...defaultLibrary(), ...takes]);
  world.pro = true;

  await bootApp('/tidy');
  await scan();
  await openGrid(/^Same shot/);
  await fireEvent.press(await screen.findByRole('button', { name: /^Keep 1 · Remove 2/ }));
  await fireEvent.press((await screen.findAllByRole('button', { name: 'Move 2 to Trash' })).at(-1)!);
  await fireEvent.press(await screen.findByRole('button', { name: 'Move to Trash' }));
  expect(await screen.findByText('Moved 2 to Trash', {}, { timeout: 10000 })).toBeTruthy();
  expect(trash).toHaveBeenCalledTimes(1);
  expect(takes.filter((p) => byId(p.id))).toHaveLength(1);
  screen.unmount();

  // Pro lapses: the Done card's Undo still works
  world.pro = false;
  await AsyncStorage.removeItem('@picdump_pro_known');
  await bootApp('/tidy');
  await fireEvent.press(await screen.findByRole('button', { name: 'Undo the move to Trash' }, { timeout: 10000 }));
  await settle();
  expect(screen.queryByText(PAYWALL)).toBeNull();
  expect(takes.every((p) => byId(p.id))).toBe(true);
}, 60000);

test('free: Trash history restores a move made while Pro', async () => {
  const takes = burst(new Date(2025, 5, 1, 12), 3, [22]);
  seedWorld([...defaultLibrary(), ...takes]);
  world.pro = true;
  await bootApp('/tidy');
  await scan();
  await openGrid(/^Same shot/);
  await fireEvent.press(await screen.findByRole('button', { name: /^Keep 1 · Remove 2/ }));
  await fireEvent.press((await screen.findAllByRole('button', { name: 'Move 2 to Trash' })).at(-1)!);
  await fireEvent.press(await screen.findByRole('button', { name: 'Move to Trash' }));
  await screen.findByText('Moved 2 to Trash', {}, { timeout: 10000 });
  screen.unmount();

  world.pro = false;
  await AsyncStorage.removeItem('@picdump_pro_known');
  await bootApp('/tidy/history');
  await fireEvent.press(await screen.findByRole('button', { name: 'Restore 2 photos' }, { timeout: 10000 }));
  await settle();
  expect(screen.queryByText(PAYWALL)).toBeNull();
  expect(takes.every((p) => byId(p.id))).toBe(true);
}, 60000);
