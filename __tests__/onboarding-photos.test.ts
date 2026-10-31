import { poolFromLibrary, poolFromStories, showable } from '../src/services/onboardingPhotos';
import type { IndexedPhoto } from '../src/services/index/photoIndex';
import type { Story } from '../src/services/stories';

const worth = require('../src/services/stories/worth.json') as { n: number; groups: string[]; w: number[]; g: number[] };
// the best-rated tag of a group, and the worst-rated tag overall (a hand, a page of notes: low worth)
const best = (group: string) => {
  const ids = worth.g.map((g, i) => (worth.groups[g] === group ? i : -1)).filter((i) => i >= 0);
  return ids.reduce((a, b) => (worth.w[b] > worth.w[a] ? b : a));
};
const DULL = worth.w.indexOf(Math.min(...worth.w));

let n = 0;
const MIN = 60 * 1000;
const photo = (tag: number, at = 0): IndexedPhoto => ({ id: `p${n++}`, uri: `file://p${n}.jpg`, creationTime: at, concepts: [tag], conceptScores: [0.3] }) as unknown as IndexedPhoto;
const story = (picks: IndexedPhoto[], over: Partial<Story> = {}): Story => ({ kind: 'topic', worth: 0.8, picks, photos: picks, ...over }) as unknown as Story;
const uris = (xs: IndexedPhoto[]) => xs.map((p) => p.uri);

test('a photo is showable when its tags are worth a dump', () => {
  expect(showable(photo(best('pets')))).toBe(true);
  expect(showable(photo(DULL))).toBe(false);
  expect(showable({ ...photo(best('pets')), concepts: [], conceptScores: [] })).toBe(false); // not read yet
  expect(showable(photo(best('sensitive')))).toBe(false);
});

test('the stories pool takes one photo per story, best story first, then seconds', () => {
  const a = [photo(best('pets')), photo(best('food'))], b = [photo(best('nature'))], c = [photo(best('travel')), photo(best('city'))];
  const pool = poolFromStories([story(a), story(b), story(c)], 10);
  expect(pool).toHaveLength(5);
  // round one: a story's first pick comes before any story's second
  const firsts = new Set([a[0], b[0], c[0]].map((p) => p.uri));
  expect(pool.slice(0, 3).every((u) => firsts.has(u))).toBe(true);
});

test('the stories pool skips today, recaps, low-rated stories and dull photos, and stops at n', () => {
  const good = photo(best('pets'));
  const pool = poolFromStories([
    story([photo(best('pets'))], { kind: 'today' }), story([photo(best('pets'))], { kind: 'recap' }), story([photo(best('pets'))], { worth: 0.2 }),
    story([photo(DULL)]), story([good]),
  ], 10);
  expect(pool).toEqual([good.uri]);
  expect(poolFromStories([story([photo(best('pets')), photo(best('food')), photo(best('nature'))])], 1)).toHaveLength(1);
});

test('the library pool ranks by worth, drops dull photos, and keeps moments and kinds apart', () => {
  const lib = [
    photo(DULL, 0 * MIN), photo(best('pets'), 100 * MIN), photo(best('pets'), 101 * MIN), // same moment: one of them
    photo(best('pets'), 300 * MIN), photo(best('pets'), 500 * MIN), photo(best('pets'), 700 * MIN), // a fourth pet: over the per-kind cap
    photo(best('food'), 900 * MIN),
  ];
  const pool = poolFromLibrary(lib, worth.n, 12);
  expect(pool).not.toContain(lib[0].uri);
  expect(pool.filter((u) => uris(lib).includes(u))).toHaveLength(pool.length);
  expect(pool).toHaveLength(4); // 3 pets (one of the pair at 100/101 min) + 1 food
  expect(pool).toContain(lib[6].uri);
});

test('the library pool is empty when the worth ratings are for another vocabulary', () => {
  expect(poolFromLibrary([photo(best('pets'))], worth.n + 1, 12)).toEqual([]);
});
