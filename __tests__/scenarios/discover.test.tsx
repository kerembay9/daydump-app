import { fireEvent, screen, within } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';

const LONG = 'An autumn of golden retriever puppy splashing through the shallow waves';
const META = /^\d+ photos · \S.*$/;

beforeAll(() => seedWorld());

test('stories show "{N} photos · {range}" and long titles in full; tapping a tile makes it the hero', async () => {
  await bootApp('/');
  await screen.findByText('Other dumps', {}, { timeout: 10000 });

  // hero + 2 tiles, every one with its meta line
  for (const [title, meta] of [[LONG, '6 photos · Sep 22–Oct 22, 2025'], ['A week in Seattle', '6 photos · Aug 4–9, 2025'], ['Cinnamon rolls', '6 photos · May 1–Jun 12, 2025']]) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(screen.getAllByText(meta).length).toBeGreaterThan(0);
    expect(meta).toMatch(META);
  }
  // The long title is the whole string, shrunk to fit on two lines rather than cut with an ellipsis.
  const hero = screen.getByText(LONG);
  expect(hero.props.numberOfLines).toBe(2);
  expect(hero.props.adjustsFontSizeToFit).toBe(true);
  expect(hero.props.ellipsizeMode).toBeUndefined();
  expect(screen.queryByText(/…$/)).toBeNull();

  expect(screen.getByLabelText(`Preview ${LONG}`)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('A week in Seattle, 6 photos · Aug 4–9, 2025'));
  expect(await screen.findByLabelText('Preview A week in Seattle')).toBeTruthy();
  // the old hero is a tile now
  expect(screen.getByLabelText(`${LONG}, 6 photos · Sep 22–Oct 22, 2025`)).toBeTruthy();
  expect(screen.queryByLabelText('Preview A week in Seattle, 6 photos · Aug 4–9, 2025')).toBeNull();
}, 30000);

test('indexing strip: fast-mode progress with Pause; paused shows Resume', async () => {
  // The native worker is mid-run (fast mode, on battery): the app follows it and offers Pause.
  world.bg = { state: 'running', total: 3000, left: 2000, batteryPct: 12, msPerPhoto: 50 };
  await bootApp('/');
  const progress = await screen.findByText('Reading your library · 1,000/3,000 · ~2 min', {}, { timeout: 10000 });
  const strip = progress.parent!.parent!.parent!;
  expect(within(strip).getByText('Keeps going if you leave · uses ~12% battery')).toBeTruthy();

  await fireEvent.press(within(strip).getByText('Pause'));
  expect(await screen.findByText('Paused at 1,000 of 3,000', {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByText('Resume')).toBeTruthy();
  expect(screen.queryByText('Pause')).toBeNull();
  world.bg.state = 'done';
}, 30000);
