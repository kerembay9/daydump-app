import { filterPhotos, people, suggestMerge, type Person } from '../src/services/people';
import { floatsToB64 } from '../src/services/index/vectors';

const face = { score: 1, x: 0, y: 0, w: 0.2, h: 0.2, vec: floatsToB64(new Float32Array(4)) };
const scans = { a: { aspect: 1, faces: [face] }, b: { aspect: 1, faces: [face] }, c: { aspect: 1, faces: [face] } };

test('groups given the same name (any case) are one person', () => {
  const ps = people({ scans, names: { 'a#0': 'Ada', 'b#0': 'ada' } }, { 'a#0': 0, 'b#0': 1, 'c#0': 2 });
  expect(ps.map((p) => [p.name, p.photos])).toEqual([['Ada', 2], ['', 1]]);
});

test('groups sharing a tag are one person, and can be told apart again', () => {
  const ps = people({ scans, names: {}, tags: { 'a#0': 'x', 'c#0': 'x' } }, { 'a#0': 0, 'b#0': 1, 'c#0': 2 });
  expect(ps.map((p) => [p.id, p.photos, p.merged])).toEqual([[0, 2, true], [1, 1, false]]);
});

test('a suggestion is the likeliest pair, never two in one photo or two the user said are not', () => {
  const p = (id: number, cos: number, uris: string[]) => ({ id, vec: new Float32Array([cos, Math.sqrt(1 - cos * cos), 0]), uris: new Set(uris), shots: [{ key: `k${id}` }] }) as unknown as Person;
  const [a, b, c] = [p(0, 1, ['a']), p(1, 0.6, ['b']), p(2, 0.45, ['c'])];
  const far = { ...p(3, 0, ['d']), vec: new Float32Array([0, 0, 1]) };
  expect(suggestMerge([a, b, c, far])?.map((x) => x.id)).toEqual([1, 2]);
  expect(suggestMerge([a, b, c, far], [['k1', 'k2']])?.map((x) => x.id)).toEqual([0, 1]);
  expect(suggestMerge([a, p(1, 0.6, ['a'])])).toBeNull();
  expect(suggestMerge([a, far])).toBeNull();
  const many = (id: number, at: number) => ({ ...p(id, id ? 0.6 : 1, []), uris: new Set(Array.from({ length: 40 }, (_, i) => String(at + i))) });
  expect(suggestMerge([many(0, 0), many(1, 39)])).toHaveLength(2); // one lookalike's photo doesn't keep two big groups apart
  expect(suggestMerge([many(0, 0), many(1, 20)])).toBeNull();
});

test('a face the detector is unsure of (a toy, a burger) is nobody', () => {
  const ps = people({ scans: { a: { aspect: 1, faces: [face] }, b: { aspect: 1, faces: [{ ...face, score: 0.79 }] } }, names: {} }, { 'a#0': 0, 'b#0': 0 });
  expect(ps.map((p) => p.photos)).toEqual([1]);
});

test("a person's picture is one of their usual faces, not the biggest stray in the group", () => {
  const axis = (k: number) => { const v = new Float32Array(4); v[k] = 1; return floatsToB64(v); };
  const small = { ...face, vec: axis(0) };
  const stray = { ...face, w: 0.9, h: 0.9, vec: axis(1) };
  const faces = [stray, small, small, small];
  const [p] = people({ scans: { a: { aspect: 1, faces } }, names: {} }, { 'a#0': 0, 'a#1': 0, 'a#2': 0, 'a#3': 0 });
  expect(p.shots[0].f.h).toBe(0.2);
});

test('filter: with is all of them (or any, if either); without always wins', () => {
  const uris = (u: string[]) => new Set(u);
  const list = [{ id: 0, uris: uris(['a', 'b']) }, { id: 1, uris: uris(['b', 'c']) }] as Parameters<typeof filterPhotos>[2];
  const photos = ['a', 'b', 'c', 'd'].map((uri) => ({ uri }));
  const kept = (f: Partial<Parameters<typeof filterPhotos>[1]>) => filterPhotos(photos, { with: [], without: [], either: false, ...f }, list).map((p) => p.uri);
  expect(kept({})).toEqual(['a', 'b', 'c', 'd']);
  expect(kept({ with: [0, 1] })).toEqual(['b']);
  expect(kept({ with: [0, 1], either: true })).toEqual(['a', 'b', 'c']);
  expect(kept({ without: [0] })).toEqual(['c', 'd']);
  expect(kept({ with: [1], without: [0] })).toEqual(['c']);
  expect(kept({ with: [9] })).toEqual(['a', 'b', 'c', 'd']); // someone no longer found filters nothing
});
