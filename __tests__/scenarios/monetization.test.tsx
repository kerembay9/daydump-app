import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';
import { list, update } from '../../src/services/dumps';
import { getProfile } from '../../src/services/profile';

const LONG = 'An autumn of golden retriever puppy splashing through the shallow waves';
const META = '6 photos · Sep 22–Oct 22, 2025';

beforeEach(async () => {
  seedWorld();
  world.pro = false;
  await AsyncStorage.removeItem('@picdump_unlocks');
  // the first-full-Discover paywall has its own test
  await AsyncStorage.setItem('@picdump_first_paywall_shown', '1');
});
afterAll(() => { world.pro = true; });

test('free: dumps are locked; the free unlock opens one, the next asks for Pro', async () => {
  await bootApp('/');
  const tile = await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 });
  expect(screen.getByLabelText('Unlock A week in Seattle')).toBeTruthy();

  await fireEvent.press(tile);
  await fireEvent.press(await screen.findByText('Use free unlock'));
  // the unlocked dump opens in Preview
  expect(await screen.findByLabelText('Post on Instagram or TikTok')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Back'));

  // it stays open; the next locked one says when the next free unlock is, and offers Pro
  expect(await screen.findByLabelText(`${LONG}, ${META}`)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Unlock A week in Seattle'));
  expect(await screen.findByText(/Your next free dump is in 7 days\.$/)).toBeTruthy();
  expect(screen.queryByText('Use free unlock')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Unlock all with Pro'));
  expect(await screen.findByText('Every dump in your roll.')).toBeTruthy();
}, 30000);

test('Pro: nothing is locked', async () => {
  world.pro = true;
  await bootApp('/');
  expect(await screen.findByLabelText(`${LONG}, ${META}`, {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByLabelText('Preview A week in Seattle')).toBeTruthy();
  expect(screen.queryByText('Unlock')).toBeNull();
}, 30000);

test('the first time Discover is full of locked dumps, the paywall names them, once', async () => {
  await AsyncStorage.removeItem('@picdump_first_paywall_shown');
  await bootApp('/');
  expect(await screen.findByText('We found 3 dumps in your roll.', {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByText(/^A week in Seattle, .*\. Pro opens all of them\.$/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Close paywall'));
  screen.unmount();

  await bootApp('/');
  await screen.findByLabelText('Unlock A week in Seattle', {}, { timeout: 10000 });
  expect(screen.queryByText(/We found \d+ dumps/)).toBeNull();
}, 30000);

test('free: tapping search opens the paywall instead of the field', async () => {
  await bootApp('/create');
  const field = await screen.findByPlaceholderText('Search keyword, place, date...', {}, { timeout: 10000 });
  await fireEvent(field, 'focus');
  expect(await screen.findByText('Every dump in your roll.')).toBeTruthy();
  expect(screen.queryByText('Last searches')).toBeNull();
  expect(screen.queryByText('Try')).toBeNull();
}, 30000);

test('free: changing photos per dump opens the paywall and keeps the range', async () => {
  await bootApp('/profile');
  await screen.findByText('Profile & Settings', {}, { timeout: 10000 });
  await fireEvent.press(screen.getByLabelText('Raise most photos'));
  expect(await screen.findByText('Every dump in your roll.')).toBeTruthy();
  expect((await getProfile()).slidesMax).toBe(10);
}, 30000);

test('free exports end with the PicDump slide; Pro exports do not', async () => {
  const draw = jest.requireMock('@shopify/react-native-skia').drawAsImage as jest.Mock;
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 }));
  draw.mockClear();
  await fireEvent.press(await screen.findByText('Use free unlock'));
  // 6 photo slides + the end slide, rendered ahead in the background
  await waitFor(() => expect(draw).toHaveBeenCalledTimes(7));
}, 30000);

test('free: saving a dump with a Pro film look asks first; "Export without finish" saves it anyway', async () => {
  await bootApp('/');
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}, locked`, {}, { timeout: 10000 }));
  await fireEvent.press(await screen.findByText('Use free unlock'));
  await screen.findByLabelText('Post on Instagram or TikTok');
  await fireEvent.press(screen.getByLabelText('Back'));
  // the unlock made its Library draft; give it a Pro look, then open it again
  const [draft] = await list('draft');
  await update(draft.id, { filter: { key: 'cashmere', pct: 68, all: true, per: {} } });
  await fireEvent.press(await screen.findByLabelText(`${LONG}, ${META}`));

  await fireEvent.press(await screen.findByLabelText('Save only, to the PicDump album'));
  expect(await screen.findByText('This film look is Pro')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Export without finish'));
  expect(await screen.findByText('Saved to your phone')).toBeTruthy();
}, 30000);
