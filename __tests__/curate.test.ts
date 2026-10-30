import { curate, Curated, isSensitive, PAGE, photoWorth } from '../src/services/stories/curate';
import { densestCluster } from '../src/services/stories/topics';
import type { IndexedPhoto } from '../src/services/index/photoIndex';

const worth = require('../src/services/stories/worth.json') as { n: number; groups: string[]; w: number[]; g: number[] };
const vocab = require('../jest/fixtures/vocab.json') as { names: string[] };
const tag = (group: string) => worth.g.findIndex((g) => worth.groups[g] === group);
const photo = (concepts: number[], scores: number[]) => ({ id: 'x', concepts, conceptScores: scores }) as unknown as IndexedPhoto;

// score-ordered stories: s(group, worth) with descending scores
let score = 1000;
const s = (group: string, w = 0.6): Curated & { id: number } => ({ id: score, score: score--, group, worth: w });
const groups = (xs: Curated[]) => xs.map((x) => x.group);

test('worth.json rates every vocab tag', () => {
  expect(worth.n).toBe(vocab.names.length);
  expect(worth.w).toHaveLength(worth.n);
  expect(worth.g).toHaveLength(worth.n);
});

test('a photo is sensitive when its top tag, or a top-3 tag nearly as strong, is', () => {
  const id = tag('sensitive'), cat = tag('pets'), food = tag('food');
  expect(isSensitive(photo([id, cat, food], [0.3, 0.29, 0.28]))).toBe(true);
  expect(isSensitive(photo([cat, id, food], [0.3, 0.298, 0.28]))).toBe(true);
  expect(isSensitive(photo([cat, id, food], [0.3, 0.28, 0.27]))).toBe(false);
  expect(isSensitive(photo([cat, food, food, id], [0.3, 0.3, 0.3, 0.3]))).toBe(false);
  expect(photoWorth(photo([id], [0.3]))).toBeLessThan(0.1);
});

test('worth < 0.2 stays off the first page', () => {
  const low = s('food', 0.1);
  const rest = Array.from({ length: 40 }, (_, i) => s(`g${i}`));
  const out = curate([low, ...rest]);
  expect(out.slice(0, PAGE)).not.toContain(low);
  expect(out.indexOf(low)).toBeGreaterThanOrEqual(PAGE);
});

test('caps per page: 1 per low group, 3 per other group, none for trips; no group twice in a row; nothing dropped', () => {
  const ranked = [
    ...Array.from({ length: 5 }, () => s('paper')),
    ...Array.from({ length: 5 }, () => s('pets')),
    ...Array.from({ length: 5 }, () => s('trip')),
    ...Array.from({ length: 60 }, (_, i) => s(`g${i % 30}`)),
  ];
  const out = curate(ranked);
  expect(out).toHaveLength(ranked.length); // the rules only reorder; leftovers relax them at the tail
  for (const p of [0, PAGE]) {
    const page = out.slice(p, p + PAGE);
    expect(groups(page).filter((g) => g === 'paper').length).toBeLessThanOrEqual(1);
    expect(groups(page).filter((g) => g === 'pets').length).toBeLessThanOrEqual(3);
    page.slice(1).forEach((x, i) => expect(x.group).not.toBe(page[i].group));
  }
  expect(groups(out.slice(0, PAGE)).filter((g) => g === 'trip')).toHaveLength(5);
});

test('never empty: unmeetable rules relax instead of dropping', () => {
  const ranked = Array.from({ length: 10 }, () => s('screens'));
  const out = curate(ranked);
  expect(out.map((x) => x.score)).toEqual(ranked.map((x) => x.score));
  expect(curate([])).toEqual([]);
});

test('private events keep their densest burst', () => {
  const t = (d: number) => ({ p: { creationTime: d * 86_400_000 } });
  const xs = [t(0), t(1), t(10), t(10.5), t(11), t(13), t(30)];
  expect(densestCluster(xs, 2 * 86_400_000)).toEqual([t(10), t(10.5), t(11), t(13)]);
});
