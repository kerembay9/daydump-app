// Pure-logic checks for the story engine. Run: npx -y tsx scripts/selfcheck.ts
// (Tokenizer + model parity is checked on-device: Debug screen -> "Self-check", against src/services/index/clipGolden.json.)
import assert from 'node:assert/strict';
import { placeFor } from '../src/services/index/cityLookup';
import type { IndexedPhoto } from '../src/services/index/photoIndex';
import { suggestSwaps } from '../src/services/stories/swaps';
import { findTopics } from '../src/services/stories/topics';
import { findTrips, tripTitle } from '../src/services/stories/trips';
import { dateRange, topicTitle } from '../src/services/stories/titles';

const H = 3_600_000, D = 24 * H;
let n = 0;
const photo = (t: number, lat?: number, lon?: number, concepts: number[] = []): IndexedPhoto => ({
  id: `p${n++}`, uri: '', creationTime: t, width: 1, height: 1, mediaType: 'photo',
  location: lat != null ? { latitude: lat, longitude: lon! } : undefined,
  concepts, conceptScores: concepts.map(() => 0.3),
});

// cities
assert.equal(placeFor(47.61, -122.33)?.city, 'Seattle');
assert.equal(placeFor(41.04, 29.0)?.city, 'Istanbul');
assert.equal(placeFor(0, -150), null); // mid-Pacific

// trips: 20 days in Istanbul, a Wed->Tue week in Seattle, back home
const t0 = new Date(2026, 2, 2, 10).getTime(); // Mon 2 Mar 2026
const lib: IndexedPhoto[] = [];
for (let d = 0; d < 20; d++) lib.push(photo(t0 + d * D, 41.01, 28.97));
for (let d = 0; d < 7; d++) for (let h = 0; h < 3; h++) lib.push(photo(t0 + (23 + d) * D + h * 4 * H, 47.6 + h * 0.01, -122.33));
lib.push(photo(t0 + 31 * D, 41.01, 28.97));
lib.push(photo(t0 + 31 * D + H)); // no GPS: ignored
const trips = findTrips(lib, placeFor);
assert.equal(trips.length, 1);
assert.equal(trips[0].homeCity, 'Istanbul');
assert.equal(trips[0].photos.length, 21);
assert.equal(tripTitle(trips[0]), 'A week in Seattle');

// a 36h+ gap splits trips; short runs are dropped
const split = findTrips([...lib.slice(0, 20), ...[0, 1, 2, 3, 4, 5].map((i) => photo(t0 + 40 * D + i * H, 48.85, 2.35)), ...[0, 1, 2].map((i) => photo(t0 + 45 * D + i * H, 48.85, 2.35))], placeFor);
assert.deepEqual(split.map((t) => [t.place, t.photos.length]), [['Paris', 6]]);
assert.equal(tripTitle(split[0]), 'A day in Paris');

// topics: "person" (0) on most photos = generic; "cinnamon roll" (7) on 8 photos over 8 weeks = topic;
// "red" (3) only twice = too few
const names = ['person', 'tree', 'sky', 'wearing red', 'car', 'dog', 'cat', 'cinnamon roll'];
const base = new Date(2025, 9, 6, 9).getTime(); // Oct 2025
const tl: IndexedPhoto[] = [];
for (let i = 0; i < 60; i++) tl.push(photo(base + i * D, undefined, undefined, [0, 1 + (i % 3)]));
for (let i = 0; i < 8; i++) tl.push(photo(base + i * 7 * D + H, undefined, undefined, [7, 0]));
tl.push(photo(base, undefined, undefined, [3]), photo(base + D, undefined, undefined, [3]));
const topics = findTopics(tl, names);
assert.deepEqual(topics.map((t) => t.name).includes('person'), false);
assert.equal(topics[0].name, 'cinnamon roll');
assert.equal(topics[0].photos.length, 8);
assert.equal(topicTitle(topics[0]), 'An autumn of cinnamon rolls');
assert.equal(topicTitle({ name: 'wearing red', start: new Date(2025, 11, 3).getTime(), end: new Date(2026, 1, 20).getTime() }), 'A red winter');
assert.equal(topicTitle({ name: 'a hike', start: base, end: base + 3 * D }), 'Hike · Oct 6–Oct 9 2025');

// near-duplicate topics merge: "pastry" (1) on the same photos as "cinnamon roll" (7)
const dup = [...tl, ...[]];
dup.slice(60, 68).forEach((p) => (p.concepts = [7, 1]));
const merged = findTopics(dup.filter((p) => p.concepts.includes(7)).concat(tl.slice(0, 40).map((p) => ({ ...p, concepts: [0] }))), ['person', 'pastry', '', '', '', '', '', 'cinnamon roll']);
assert.equal(merged.length, 1);
assert.deepEqual(merged[0].related, ['pastry']);

assert.equal(dateRange(new Date(2025, 0, 1).getTime(), new Date(2025, 5, 1).getTime()), 'Jan–Jun 2025');
// swaps: set = beach photos (axis 0); a near-copy of a slide is skipped, other beach photos beat dogs (axis 1)
const vec = (...xs: number[]) => { const v = new Float32Array(512); xs.forEach((x, j) => (v[j] = x)); const m = Math.hypot(...v); return v.map((x) => x / m); };
const sv = [vec(1, 0, 0.1), vec(1, 0, -0.1), vec(1, 0.01, 0.1), vec(0.9, 0.3), vec(0.1, 1), vec(0, 1, 1)];
const sp = sv.map((_, i) => photo(base + i * D));
const swapLib = { photos: sp, vecs: new Float32Array(sv.length * 512), conceptNames: [], hasClip: true };
sv.forEach((v, i) => swapLib.vecs.set(v, i * 512));
assert.deepEqual(suggestSwaps(swapLib, [sp[0], sp[1]], sp[0]).map((p) => p.id), [sp[3].id, sp[4].id, sp[5].id]);
// no embeddings: nearest in time
const noVec = { ...swapLib, vecs: new Float32Array(sv.length * 512) };
assert.deepEqual(suggestSwaps(noVec, [sp[0]], sp[0], 2).map((p) => p.id), [sp[1].id, sp[2].id]);

console.log('selfcheck ok');
