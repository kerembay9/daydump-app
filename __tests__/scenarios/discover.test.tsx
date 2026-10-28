import { fireEvent, screen, within } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld, world } from '../../jest/world';
import { coverageLine, eta } from '../../src/components/IndexStrip';

const LONG = 'An autumn of golden retriever puppy splashing through the shallow waves';
const META = /^\d+ photos · \S.*$/;

beforeAll(() => seedWorld());

test('stories show "{N} photos · {range}" and long titles in full; tapping a tile opens its preview', async () => {
  await bootApp('/');
  await screen.findByLabelText(/^A week in Seattle, /, {}, { timeout: 10000 });
  expect(screen.queryByText('Other dumps')).toBeNull();

  // hero + 2 tiles, every one with its meta line
  for (const [title, meta] of [[LONG, '6 photos · Sep 22–Oct 22, 2025'], ['A week in Seattle', '9 photos · Aug 4–10, 2025'], ['Cinnamon rolls', '7 photos · May 1–Jun 12, 2025']]) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(screen.getAllByText(meta).length).toBeGreaterThan(0);
    expect(meta).toMatch(META);
  }
  // the 7-day trip outranks the weekly topics
  expect(screen.getByLabelText(/^A week in Seattle, /)).toBeTruthy();
  // no Edit chip on the hero: Edit is reached from Preview
  expect(screen.queryByLabelText(/^Edit /)).toBeNull();
  // and no Preview pill: tapping the photos is the preview
  expect(screen.queryByText('Preview')).toBeNull();

  // The long title is the whole string, shrunk to fit on two lines rather than cut with an ellipsis.
  const tile = screen.getAllByText(LONG).find((x) => x.props.adjustsFontSizeToFit)!;
  expect(tile.props.numberOfLines).toBe(2);
  expect(tile.props.ellipsizeMode).toBeUndefined();
  expect(screen.queryByText(/…$/)).toBeNull();

  // tapping a tile opens its preview; the hero stays
  await fireEvent.press(screen.getByLabelText(`${LONG}, 6 photos · Sep 22–Oct 22, 2025`));
  expect(await screen.findByLabelText('Post')).toBeTruthy();
}, 30000);

test('indexing strip: fast-mode progress with Pause; paused shows Resume', async () => {
  // The native worker is mid-run (fast mode, on battery): the app follows it and offers Pause.
  world.bg = { state: 'running', total: 3000, left: 2000, batteryPct: 12, msPerPhoto: 50 };
  await bootApp('/');
  const line = /^Reading your library… 1,(\d{3})\/3,000$/;
  const progress = await screen.findByText(line, {}, { timeout: 10000 });
  const strip = progress.parent!.parent!.parent!.parent!;
  // the ticking count is fixed-width and the time left is its own piece, so it doesn't hop between lines as the count changes
  expect(progress.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ fontVariant: ['tabular-nums'] })]));
  expect(within(strip).getByText(' · About 2 min left')).toBeTruthy();
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

test('dumps open with 4 to 10 photos, the middle most likely, 10 not rare, and a story keeps its count', () => {
  const { slideCount } = require('../../src/services/stories');
  const n = Array.from({ length: 5000 }, (_, i) => slideCount(`topic:${i}`));
  const share = (k: number) => n.filter((x) => x === k).length / n.length;
  expect([...new Set(n)].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8, 9, 10]);
  expect(share(10)).toBeGreaterThan(0.07);
  expect(share(7)).toBeGreaterThan(share(10));
  expect(slideCount('x', 5, 5)).toBe(5);
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

describe('Discover picks and topics', () => {
  const H = 3_600_000, D = 24 * H;
  const t0 = new Date(2025, 4, 3, 9).getTime();
  const ph = (id: string | number, t: number, concepts: number[] = [], uri = `file:///storage/emulated/0/DCIM/Camera/${id}.jpg`) =>
    ({ id: String(id), uri, creationTime: t, width: 1, height: 1, concepts, conceptScores: concepts.map(() => 0.3) });
  type P = ReturnType<typeof ph>;
  // every photo its own direction unless vec() says otherwise
  const libOf = (photos: P[], vec: Record<string, [number, number]> = {}, looks = new Map()) => {
    const vecs = new Float32Array(photos.length * 512);
    photos.forEach((p, i) => {
      const v = vec[p.id];
      if (v) { vecs[i * 512] = v[0]; vecs[i * 512 + 1] = v[1]; } else vecs[i * 512 + 2 + (i % 500)] = 1;
    });
    return { photos, vecs, conceptNames: ['x'], hasClip: true, looks };
  };
  const pickOf = (photos: P[], n: number, vec?: Record<string, [number, number]>, looks?: Map<string, unknown>) => {
    const { pick } = require('../../src/services/stories');
    const lib = libOf(photos, vec, looks);
    return (pick(photos, lib, new Map(photos.map((p, i) => [p.id, i])), () => 0, n) as P[]).map((p) => p.id);
  };

  test('a big afternoon does not fill the dump: every moment gets a slide first', () => {
    const afternoon = Array.from({ length: 40 }, (_, i) => ph(`a${i}`, t0 + i * 60_000));
    const others = [1, 2, 3].flatMap((d) => [ph(`m${d}a`, t0 + d * D), ph(`m${d}b`, t0 + d * D + 60_000)]);
    const ids = pickOf([...afternoon, ...others], 6);
    expect(ids).toHaveLength(6);
    for (const d of [1, 2, 3]) expect(ids.some((id) => id.startsWith(`m${d}`))).toBe(true);
    expect(ids.filter((id) => id.startsWith('a')).length).toBeLessThanOrEqual(3);
  });

  test('two takes of one shot (cosine 0.945, 2 min apart) make one slide; the same look a day later is a new one', () => {
    const s = Math.sqrt(1 - 0.945 ** 2);
    const ps = [ph('a', t0), ph('b', t0 + 2 * 60_000), ph('c', t0 + D)];
    expect(pickOf(ps, 3, { a: [1, 0], b: [0.945, s], c: [0.945, s] }).sort()).toEqual(['a', 'c']);
  });

  test("after a Tidy scan, black frames and blurry shots only fill what's left", () => {
    const ok = JSON.stringify({ b: 120, sd: 50, lap: 200, hi: 0, lo: 0, finger: false, tilt: 0 });
    const looks = new Map([
      ['black', { stats: JSON.stringify({ b: 5, sd: 3, lap: 1, hi: 0, lo: 1, finger: false }), faces: null, sharp: null }],
      ['blur', { stats: ok, faces: null, sharp: 3 }],
      ['dark', { stats: JSON.stringify({ b: 20, sd: 30, lap: 200, hi: 0, lo: 0.6, finger: true, tilt: 4 }), faces: null, sharp: null }],
      ['good', { stats: ok, faces: null, sharp: 80 }],
    ]);
    const ps = ['black', 'blur', 'dark', 'good'].map((id, i) => ph(id, t0 + i * 60_000));
    expect(pickOf(ps, 1, undefined, looks)).toEqual(['good']);
    expect(pickOf(ps, 2, undefined, looks).sort()).toEqual(['dark', 'good']);
    expect(pickOf(ps, 4, undefined, looks)).toHaveLength(4);
  });

  test('people words and obscure tags make no topic; "latte art" is no topic of its own but named in a bigger one', () => {
    const { noTopic } = require('../../src/services/stories/curate');
    const { findTopics } = require('../../src/services/stories/topics');
    const vocab = require('../../modules/clip-embedder/android/src/main/assets/clip/vocab.json').names as string[];
    for (const t of ['woman', 'man', 'person', 'adult', 'ford e-series', 'body man']) expect([t, noTopic(vocab.indexOf(t))]).toEqual([t, true]);
    for (const t of ['latte art', 'museum', 'sunset', 'beach', 'dog', 'birthday']) expect([t, noTopic(vocab.indexOf(t))]).toEqual([t, false]);

    // tag 0 on 20 photos over 20 days, tag 1 on 8 of them; filler 2 keeps both under 25% of the library
    const ps = Array.from({ length: 100 }, (_, i) => ph(i, t0 + i * D, i < 20 ? (i < 8 ? [0, 1] : [0]) : [2]));
    const topics = findTopics(ps, ['drinks', 'latte art', 'filler'], undefined, undefined, (c: number) => c === 2);
    expect(topics.map((t: { name: string; related: string[] }) => [t.name, t.related])).toEqual([['drinks', ['latte art']]]);
  });

  test('a tag that comes back makes a topic each time: spring 2024 and autumn 2025', () => {
    const { findTopics } = require('../../src/services/stories/topics');
    const spring = new Date(2024, 3, 1).getTime(), autumn = new Date(2025, 9, 1).getTime();
    const ps = [...Array.from({ length: 8 }, (_, i) => ph(`s${i}`, spring + i * D, [0])), ...Array.from({ length: 10 }, (_, i) => ph(`a${i}`, autumn + i * D, [0])),
      ...Array.from({ length: 60 }, (_, i) => ph(`f${i}`, spring + i * 9 * D, [1]))];
    const topics = findTopics(ps, ['hike', 'filler'], { minPhotos: 6, minDays: 3, maxShare: 0.25, topK: 5, windowDays: 120 }, undefined, (c: number) => c === 1);
    expect(topics.map((t: { photos: unknown[] }) => t.photos.length).sort()).toEqual([10, 8]);
  });

  test('recaps: the week always, the month in its last 7 days and first 7 of the next, the year from Dec 1 to Jan 10', () => {
    const { recapPeriods } = require('../../src/services/stories');
    const titles = (y: number, m: number, d: number) => recapPeriods(new Date(y, m, d, 12).getTime()).map((r: { title: string }) => r.title);
    expect(titles(2026, 9, 15)).toEqual(['This week']); // Thu
    expect(titles(2026, 9, 26)).toEqual(['Last week', 'October']); // Mon, 5 days left
    expect(titles(2026, 10, 2)).toEqual(['Last week', 'October']);
    expect(titles(2026, 10, 7)).toEqual(['This week', 'October']); // Sat, 7th
    expect(titles(2026, 10, 8)).toEqual(['This week']);
    expect(titles(2026, 11, 3)).toEqual(['This week', 'November', 'Your 2026']);
    expect(titles(2026, 11, 28)).toEqual(['Last week', 'December', 'Your 2026']);
    expect(titles(2027, 0, 2)).toEqual(['This week', 'December', 'Your 2026']); // Sat
    expect(titles(2027, 0, 12)).toEqual(['Last week']);
    const [week] = recapPeriods(new Date(2026, 9, 29, 12).getTime()); // Thu: Mon Oct 26 to Mon Nov 2
    expect([new Date(week.start).toDateString(), new Date(week.end).toDateString()]).toEqual(['Mon Oct 26 2026', 'Mon Nov 02 2026']);
  });

  test('Discover offers "This week" and "October" in the last days of October, from camera photos only', async () => {
    const { buildStories } = require('../../src/services/stories');
    jest.useFakeTimers({ now: new Date(2026, 9, 29, 20), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] });
    try {
      const ps = Array.from({ length: 16 }, (_, i) => ph(i, new Date(2026, 9, 26 + (i % 4), 10 + i).getTime()))
        .concat(Array.from({ length: 10 }, (_, i) => ph(`s${i}`, new Date(2026, 9, 27, 9, i).getTime(), [], `file:///storage/emulated/0/Pictures/Instagram/s${i}.jpg`)));
      const { stories } = await buildStories(libOf(ps));
      const recaps = stories.filter((s: { kind: string }) => s.kind === 'recap');
      expect(recaps.map((s: { title: string }) => s.title).sort()).toEqual(['October', 'This week']);
      expect(recaps.every((s: { photos: P[] }) => s.photos.length === 16)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test('statements and worksheets stay out of dumps, vague tags make no topic, and "October" ranks near the top', async () => {
    const { buildStories } = require('../../src/services/stories');
    const { noTopic } = require('../../src/services/stories/curate');
    const vocab = require('../../modules/clip-embedder/android/src/main/assets/clip/vocab.json').names as string[];
    const id = (n: string) => vocab.indexOf(n);
    for (const t of ['happy', 'event', 'daughter', 'red']) expect([t, noTopic(id(t), t)]).toEqual([t, true]);
    expect(noTopic(id('drinking establishment'), 'drinking establishment')).toBe(false);
    jest.useFakeTimers({ now: new Date(2026, 9, 28, 20), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] });
    try {
      const oct = Array.from({ length: 24 }, (_, i) => ph(`o${i}`, new Date(2026, 9, 1 + i, 12).getTime(), i % 3 ? [id('sunset')] : [id('a document'), id('text')]));
      // a strong topic from the summer, and filler so neither is a quarter of the library
      const beach = Array.from({ length: 60 }, (_, i) => ph(`b${i}`, new Date(2026, 6, 1 + (i % 20), 10 + (i % 8)).getTime(), [id('beach')]));
      const fill = Array.from({ length: 300 }, (_, i) => ph(`f${i}`, new Date(2024, 0, 1).getTime() + i * D, [id('a laptop at work')]));
      const { stories } = await buildStories({ ...libOf([...oct, ...beach, ...fill]), conceptNames: vocab });
      const october = stories.find((s: { title: string }) => s.title === 'October');
      expect(october.photos.every((p: P) => !p.concepts.includes(id('a document')))).toBe(true);
      expect(october.photos).toHaveLength(16);
      expect(stories.slice(0, 2).map((s: { title: string }) => s.title)).toContain('October');
    } finally {
      jest.useRealTimers();
    }
  });
});
