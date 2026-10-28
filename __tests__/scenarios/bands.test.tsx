import { StyleSheet } from 'react-native';
import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { cashmere, espresso } from '../../src/theme/tokens';
import { getProfile, setProfile } from '../../src/services/profile';
import { CORNER_W, TAPE_H } from '../../src/components/ui/Tape';

const SEATTLE = /^A week in Seattle, /;
const TAPE = [cashmere.tapeBg, espresso.tapeBg];
const tapes = () => screen.queryAllByTestId('tape').map((n) => StyleSheet.flatten(n.props.style).backgroundColor as string);

beforeAll(async () => { await seedWorld(); await setProfile({ cards: 'classic' }); }); // paper cards bring their own tape and stock

test('Bands: none takes every tape off Discover', async () => {
  await setProfile({ bands: 'none' });
  await bootApp('/');
  await screen.findByLabelText(SEATTLE, {}, { timeout: 10000 });
  expect(tapes()).toEqual([]);
}, 30000);

test('Bands: default keeps the tiles bare; the one masking tape is the Today card\'s', async () => {
  await setProfile({ bands: 'default' });
  await bootApp('/');
  await screen.findByLabelText(SEATTLE, {}, { timeout: 10000 });
  await screen.findByLabelText(/^Today: /);
  expect(tapes()).toEqual([cashmere.tapeBg]);
}, 30000);

test('Bands: more tapes every tile with washi of several colours', async () => {
  await setProfile({ bands: 'more' });
  await bootApp('/');
  await screen.findByLabelText(SEATTLE, {}, { timeout: 10000 });
  const tiles = screen.getAllByLabelText(/, \d+ photos · /).length;
  const t = tapes();
  expect(t.length).toBeGreaterThanOrEqual(tiles);
  expect(t.some((c) => TAPE.includes(c))).toBe(false);
  expect(new Set(t).size).toBeGreaterThan(1);
  // one plain strip: same height everywhere, never a stub, no stripes or dots inside
  const strips = screen.queryAllByTestId('tape').map((n) => StyleSheet.flatten(n.props.style));
  expect(new Set(strips.map((s) => s.height))).toEqual(new Set([TAPE_H]));
  expect(Math.min(...strips.map((s) => s.width as number))).toBeGreaterThanOrEqual(CORNER_W);
  expect(screen.queryAllByTestId('tape').every((n) => !n.props.children)).toBe(true);
}, 30000);

test('Developer tools → Bands cycles Default, Scrapbook, No bands and saves it', async () => {
  await setProfile({ bands: 'default', dev: true });
  await bootApp('/profile');
  const row = await screen.findByText('Bands', {}, { timeout: 10000 });
  expect(screen.getByText('Default')).toBeTruthy();
  await fireEvent.press(row);
  await settle();
  expect(screen.getByText('Scrapbook')).toBeTruthy();
  expect((await getProfile()).bands).toBe('more');
  await fireEvent.press(row);
  await settle();
  expect(screen.getByText('No bands')).toBeTruthy();
  expect((await getProfile()).bands).toBe('none');
}, 30000);
