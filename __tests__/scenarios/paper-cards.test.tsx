import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { getProfile, setProfile } from '../../src/services/profile';
import { TAPE_TONES } from '../../src/components/ui/ScrapPaper';

const TILE = /, \d+ photos · /;
const { Canvas } = jest.requireMock('@shopify/react-native-skia') as { Canvas: jest.Mock };
const tiles = () => screen.getAllByLabelText(TILE).length;
const sheets = () => screen.queryAllByTestId('scrap-paper').length;
const strips = () => screen.queryAllByTestId('scrap-strip').length;
const bands = () => screen.queryAllByTestId('tape').length;
/** torn tape is a canvas: its colour is the last Path's; masking tape is a View */
const tornColours = () => Canvas.mock.calls.filter(([p]) => p.testID === 'scrap-tape').map(([p]) => (React.Children.toArray(p.children).at(-1) as React.ReactElement<{ color: string }>).props.color);
const maskingColours = () => screen.queryAllByTestId('scrap-tape').map((n) => StyleSheet.flatten(n.props.style)?.backgroundColor as string).filter(Boolean);

beforeAll(() => seedWorld());
beforeEach(() => Canvas.mockClear());

async function discover(p: Parameters<typeof setProfile>[0]) {
  await setProfile(p);
  Canvas.mockClear();
  await bootApp('/');
  await screen.findAllByLabelText(TILE, {}, { timeout: 10000 });
}

test('Cards: classic by default, rounded cards with the Bands tape and no paper', async () => {
  await discover({ bands: 'more' });
  expect(sheets()).toBe(0);
  expect(strips()).toBe(0);
  expect(bands()).toBeGreaterThan(0);
}, 30000);

test('Cards: kraft puts every card on paper with one torn kraft strip each, and drops the Bands tape', async () => {
  await discover({ bands: 'more', cards: 'kraft' });
  expect(sheets()).toBeGreaterThanOrEqual(tiles());
  expect(bands()).toBe(0);
  expect(strips()).toBe(sheets()); // one each
  const c = tornColours();
  expect(c.length).toBeGreaterThan(0);
  expect(c.every((x) => TAPE_TONES.kraft.includes(x))).toBe(true);
}, 30000);

test('Cards: tinted tapes the paper cards in several matte colours', async () => {
  await discover({ cards: 'tinted' });
  expect(sheets()).toBeGreaterThanOrEqual(tiles());
  const c = tornColours();
  expect(c.length).toBeGreaterThan(0);
  expect(c.every((x) => TAPE_TONES.tinted.includes(x))).toBe(true);
  expect(new Set(c).size).toBeGreaterThan(1);
}, 30000);

test('Cards: paper holds each sheet with tone masking tape, mostly across the top', async () => {
  await discover({ cards: 'paper' });
  expect(sheets()).toBeGreaterThanOrEqual(tiles());
  expect(tornColours()).toHaveLength(0);
  expect(strips()).toBeGreaterThanOrEqual(sheets());
  const c = maskingColours();
  expect(c).toHaveLength(strips());
  expect(c.every((x) => TAPE_TONES.paper.includes(x))).toBe(true);
}, 30000);

test('Developer tools → Cards cycles Classic, tone, kraft, colour tape and saves it', async () => {
  await setProfile({ cards: 'classic', dev: true });
  await bootApp('/profile');
  const row = await screen.findByText('Cards', {}, { timeout: 10000 });
  for (const [name, v] of [['Paper, tone tape', 'paper'], ['Paper, kraft tape', 'kraft'], ['Paper, colour tape', 'tinted'], ['Classic', 'classic']] as const) {
    await fireEvent.press(row);
    await settle();
    expect(screen.getByText(name)).toBeTruthy();
    expect((await getProfile()).cards).toBe(v);
  }
}, 30000);
