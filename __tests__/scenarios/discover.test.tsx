import { fireEvent, screen, within } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';
import { coverageLine, eta } from '../../src/components/IndexStrip';

const LONG = 'An autumn of golden retriever puppy splashing through the shallow waves';
const META = /^\d+ photos · \S.*$/;

beforeAll(() => seedWorld());

test('stories show "{N} photos · {range}" and long titles in full; tapping a tile opens its preview', async () => {
  await bootApp('/');
  await screen.findByText('Other dumps', {}, { timeout: 10000 });

  // hero + 2 tiles, every one with its meta line
  for (const [title, meta] of [[LONG, '7 photos · Sep 22–Oct 22, 2025'], ['A week in Seattle', '6 photos · Aug 4–9, 2025'], ['Cinnamon rolls', '8 photos · May–Jun 2025']]) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(screen.getAllByText(meta).length).toBeGreaterThan(0);
    expect(meta).toMatch(META);
  }
  // the 7-day trip outranks the weekly topics
  expect(screen.getByLabelText('Preview A week in Seattle')).toBeTruthy();
  // no Edit chip on the hero: Edit is reached from Preview
  expect(screen.queryByLabelText(/^Edit /)).toBeNull();

  // The long title is the whole string, shrunk to fit on two lines rather than cut with an ellipsis.
  const tile = screen.getAllByText(LONG).find((x) => x.props.adjustsFontSizeToFit)!;
  expect(tile.props.numberOfLines).toBe(2);
  expect(tile.props.ellipsizeMode).toBeUndefined();
  expect(screen.queryByText(/…$/)).toBeNull();

  // tapping a tile opens its preview; the hero stays
  await fireEvent.press(screen.getByLabelText(`${LONG}, 7 photos · Sep 22–Oct 22, 2025`));
  expect(await screen.findByLabelText('Post on Instagram or TikTok')).toBeTruthy();
}, 30000);

test('indexing strip: fast-mode progress with Pause; paused shows Resume', async () => {
  // The native worker is mid-run (fast mode, on battery): the app follows it and offers Pause.
  world.bg = { state: 'running', total: 3000, left: 2000, batteryPct: 12, msPerPhoto: 50 };
  await bootApp('/');
  const line = /^Reading your library… 1,(\d{3})\/3,000 · About 2 min left$/;
  const progress = await screen.findByText(line, {}, { timeout: 10000 });
  const strip = progress.parent!.parent!.parent!;
  // between the worker's 3 s reports the count runs on at ~0.9 × its rate (20 photos/s here)
  const count = () => +within(strip).getByText(line).props.children.match(line)[1];
  const c0 = count();
  await settle(1000);
  expect(count() - c0).toBeGreaterThanOrEqual(15);
  expect(within(strip).getByText('Keeps going if you leave · uses ~12% battery')).toBeTruthy();
  // the dumps built so far stay, with how far back they reach
  expect(screen.getByText(/^Dumps from your last (\d+ )?(month|year)s? so far\. Dumps get better once your whole library is read\.$/)).toBeTruthy();
  expect(screen.queryByText('Building your dumps…')).toBeNull();

  await fireEvent.press(within(strip).getByText('Pause'));
  expect(await screen.findByText('Paused at 1,000 of 3,000', {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByText('Resume')).toBeTruthy();
  expect(screen.queryByText('Pause')).toBeNull();
  world.bg.state = 'done';
}, 30000);

test('time-left and coverage wording', () => {
  expect([null, 30, 100, 359, 3570, 4200, 7200].map(eta)).toEqual([
    'Working out time left…', 'Less than a minute left', 'About 2 min left', 'About 6 min left', 'About 1 h left', 'About 1 h 10 min left', 'About 2 h left',
  ]);
  expect([0.4, 3, 21, 120, 400, 800].map((d) => coverageLine(Date.now() - d * 864e5))).toEqual(['day', '3 days', '3 weeks', '4 months', '13 months', '2 years'].map((x) => `Dumps from your last ${x} so far`));
});

test('dumps open with 4 to 8 photos, mostly 6, and a story keeps its count', () => {
  const { slideCount } = require('../../src/services/stories');
  const n = Array.from({ length: 2000 }, (_, i) => slideCount(`topic:${i}`));
  expect(Math.min(...n)).toBe(4);
  expect(Math.max(...n)).toBe(8);
  expect(n.filter((x) => x === 6).length / n.length).toBeGreaterThan(0.35);
  expect(slideCount('trip:42')).toBe(slideCount('trip:42'));
});

test('screenshots make no story unless Include screenshots is on: weekly book-page screenshots tagged "reading"', async () => {
  const { buildStories } = require('../../src/services/stories');
  const lib = (folder: string) => ({
    // 8 weekly "reading" shots among 40 (a topic's tag must not cover over 25% of the library)
    photos: Array.from({ length: 40 }, (_, w) => ({
      id: String(w), uri: `file:///storage/emulated/0/${w < 8 ? folder : 'DCIM/Camera'}/IMG_${w}.jpg`, creationTime: new Date(2025, 4, 1 + 7 * w).getTime(),
      width: 1080, height: 2400, concepts: w < 8 ? [0] : [], conceptScores: w < 8 ? [0.3] : [],
    })),
    vecs: new Float32Array(40 * 512), conceptNames: ['reading'], hasClip: true,
  });
  expect((await buildStories(lib('DCIM/Camera'))).stories.map((s: { title: string }) => s.title)).toEqual([expect.stringMatching(/reading/i)]);
  expect((await buildStories(lib('Pictures/Screenshots'))).stories).toEqual([]);
  expect((await buildStories(lib('DCIM/Screenshots'))).stories).toEqual([]);
  expect((await buildStories(lib('Pictures/Screenshots'), undefined, undefined, { hideSensitive: true, screenshots: true })).stories).toHaveLength(1);
});
