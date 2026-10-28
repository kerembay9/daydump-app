import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { getProfile, setProfile } from '../../src/services/profile';
import { DARK_STOCKS, STOCKS, TAPE_TONES } from '../../src/components/ui/ScrapPaper';

const TILE = /, \d+ photos · /;
const KEY = '@daydump_profile';
const { Canvas } = jest.requireMock('@shopify/react-native-skia') as { Canvas: jest.Mock };
const tiles = () => screen.getAllByLabelText(TILE).length;
const sheets = () => screen.queryAllByTestId('scrap-paper').length;
const strips = () => screen.queryAllByTestId('scrap-strip').length;
const bands = () => screen.queryAllByTestId('tape').length;
/** torn tape is a canvas: its colour is the last Path's; masking tape is a View */
const tornColours = () => Canvas.mock.calls.filter(([p]) => p.testID === 'scrap-tape').map(([p]) => (React.Children.toArray(p.children).at(-1) as React.ReactElement<{ color: string }>).props.color);
/** each sheet's fill (drawn once the sheet has a size): the Path whose colour is a paper stock */
const layOut = async () => { for (const n of screen.queryAllByTestId('scrap-paper')) await fireEvent(n, 'layout', { nativeEvent: { layout: { width: 160, height: 180 } } }); };
const stocks = () => Canvas.mock.calls.flatMap(([p]) => React.Children.toArray(p.children).map((c) => (c as React.ReactElement<{ color?: string }>).props.color)).filter((c) => c && [...STOCKS, ...DARK_STOCKS].includes(c));
const maskingColours = () => screen.queryAllByTestId('scrap-tape').map((n) => StyleSheet.flatten(n.props.style)?.backgroundColor as string).filter(Boolean);

beforeAll(() => seedWorld());
beforeEach(() => Canvas.mockClear());

async function discover(p: Parameters<typeof setProfile>[0]) {
  await setProfile(p);
  Canvas.mockClear();
  await bootApp('/');
  await screen.findAllByLabelText(TILE, {}, { timeout: 10000 });
}

test('Cards: classic gives rounded cards with the Bands tape and no paper', async () => {
  await discover({ bands: 'more', cards: 'classic' });
  expect(sheets()).toBe(0);
  expect(strips()).toBe(0);
  expect(bands()).toBeGreaterThan(0);
}, 30000);

test('Cards: a saved kraft (dropped) comes back as tone tape', async () => {
  await AsyncStorage.mergeItem(KEY, JSON.stringify({ cards: 'kraft' }));
  expect((await getProfile()).cards).toBe('paper');
}, 30000);

test('Cards: tinted tapes the paper cards in several matte colours', async () => {
  await discover({ cards: 'tinted' });
  expect(sheets()).toBeGreaterThanOrEqual(tiles());
  const c = tornColours();
  expect(c.length).toBeGreaterThan(0);
  expect(c.every((x) => TAPE_TONES.tinted.includes(x))).toBe(true);
  expect(new Set(c).size).toBeGreaterThan(1);
}, 30000);

test('Cards: paper by default, each sheet held by tone masking tape, and no Bands tape', async () => {
  const { cards: _, ...rest } = await getProfile();
  await AsyncStorage.setItem(KEY, JSON.stringify(rest)); // no saved choice
  await discover({ bands: 'more' });
  expect(bands()).toBe(0);
  expect(sheets()).toBeGreaterThanOrEqual(tiles());
  expect(tornColours()).toHaveLength(0);
  expect(strips()).toBeGreaterThanOrEqual(sheets());
  const c = maskingColours();
  expect(c).toHaveLength(strips());
  expect(c.every((x) => TAPE_TONES.paper.includes(x))).toBe(true);
  await layOut();
  expect(stocks().length).toBeGreaterThan(0);
  expect(stocks().every((x) => STOCKS.includes(x as string))).toBe(true);
}, 30000);

test('Cards: dark mode puts the cards on charcoal sheets, still tone tape', async () => {
  await AsyncStorage.setItem('daydump.themeMode', 'dark');
  try {
    await discover({ cards: 'paper' });
    expect(sheets()).toBeGreaterThanOrEqual(tiles());
    expect(strips()).toBeGreaterThanOrEqual(sheets());
    await layOut();
    const c = stocks();
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((x) => DARK_STOCKS.includes(x as string))).toBe(true);
    expect(maskingColours().every((x) => TAPE_TONES.paper.includes(x))).toBe(true);
  } finally {
    await AsyncStorage.removeItem('daydump.themeMode');
  }
}, 30000);

test('Developer tools → Cards cycles tone tape, colour tape, Classic and saves it', async () => {
  await setProfile({ cards: 'paper', dev: true });
  await bootApp('/profile');
  const row = await screen.findByText('Cards', {}, { timeout: 10000 });
  for (const [name, v] of [['Paper, colour tape', 'tinted'], ['Classic', 'classic'], ['Paper, tone tape', 'paper']] as const) {
    await fireEvent.press(row);
    await settle();
    expect(screen.getByText(name)).toBeTruthy();
    expect((await getProfile()).cards).toBe(v);
  }
}, 30000);
