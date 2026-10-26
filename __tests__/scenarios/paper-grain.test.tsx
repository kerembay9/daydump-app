import { StyleSheet } from 'react-native';
import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { getProfile, setProfile } from '../../src/services/profile';
import { cashmere, parchment } from '../../src/theme/tokens';

const HERO = 'Preview A week in Seattle';
const { Canvas } = jest.requireMock('@shopify/react-native-skia') as { Canvas: jest.Mock };
const tileBg = () => StyleSheet.flatten(screen.getAllByLabelText(/, \d+ photos · /)[0].props.style).backgroundColor;
const paperDrawn = () => Canvas.mock.calls.some(([p]) => p.testID === 'paper');

beforeAll(() => seedWorld());
beforeEach(() => Canvas.mockClear());

test('Paper grain: on by default behind Discover with parchment cards, off takes both away', async () => {
  await bootApp('/');
  await screen.findByLabelText(HERO, {}, { timeout: 10000 });
  expect(paperDrawn()).toBe(true);
  expect(tileBg()).toBe(parchment.bgCard); // cards take the parchment creams

  await setProfile({ paper: false });
  Canvas.mockClear();
  await bootApp('/');
  await screen.findByLabelText(HERO, {}, { timeout: 10000 });
  expect(paperDrawn()).toBe(false);
  expect(tileBg()).toBe(cashmere.bgCard);
}, 30000);

test('Developer tools → Paper grain toggles and saves', async () => {
  await setProfile({ paper: true, dev: true });
  await bootApp('/profile');
  await fireEvent.press(await screen.findByText('Paper grain', {}, { timeout: 10000 }));
  await settle();
  expect((await getProfile()).paper).toBe(false);
}, 30000);
