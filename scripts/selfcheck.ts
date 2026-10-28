// Pure-logic checks for the story engine. Run: npx -y tsx scripts/selfcheck.ts
// (Tokenizer + model parity is checked on-device: Debug screen -> "Self-check", against src/services/index/clipGolden.json.)
import assert from 'node:assert/strict';
import { placeFor } from '../src/services/index/cityLookup';
import type { IndexedPhoto } from '../src/services/index/photoIndex';
import { suggestSwaps } from '../src/services/stories/swaps';
import { parseQuery, placeKey, searchLibrary } from '../src/services/stories/search';
import { fillSets, similarTo } from '../src/services/stories/suggest';
import { findTopics } from '../src/services/stories/topics';
import { findTrips, tripTitle } from '../src/services/stories/trips';
import { dateRange, disambiguate, topicTitle } from '../src/services/stories/titles';
import { copyTitle, kindLabel, matches, photoRange, rowLine, statusLine } from '../src/services/dumpLabels';
import type { Dump } from '../src/services/dumps';
import { cellAt, chunk, DEFAULT_FRAME, exportSize, frameOf, frameText, LAYOUTS, placePhoto, slideCells } from '../src/services/layouts';
import { autoAdjust, brighten, developFor, DEFAULT_FILTER, filterOf, IDENTITY, isDark, lookFor, matrixFor, PRESETS } from '../src/services/filters';
import { postDump, PostDeps, saveOnly } from '../src/services/post';

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
// titles carry no dates (the range is on the meta line)
assert.equal(topicTitle({ name: 'a hike', start: base, end: base + 3 * D }), 'Hike');
assert.equal(topicTitle({ name: 'coffee', start: base, end: base + H }), 'Coffee');
assert.equal(topicTitle({ name: 'letter (message)', start: new Date(2026, 2, 1).getTime(), end: new Date(2026, 6, 1).getTime() }), 'Letters');
assert.equal(topicTitle({ name: 'dog', start: new Date(2024, 0, 5).getTime(), end: new Date(2025, 6, 1).getTime() }), 'Dogs');

// near-duplicate topics merge: "pastry" (1) on the same photos as "cinnamon roll" (7)
const dup = [...tl, ...[]];
dup.slice(60, 68).forEach((p) => (p.concepts = [7, 1]));
const merged = findTopics(dup.filter((p) => p.concepts.includes(7)).concat(tl.slice(0, 40).map((p) => ({ ...p, concepts: [0] }))), ['person', 'pastry', '', '', '', '', '', 'cinnamon roll']);
assert.equal(merged.length, 1);
assert.deepEqual(merged[0].related, ['pastry']);

// date ranges (decisions.md #3), "now" = Oct 2026
const NOW = new Date(2026, 9, 20, 12).getTime();
const dr = (a: [number, number, number, number?], b: [number, number, number, number?]) =>
  dateRange(new Date(a[0], a[1], a[2], a[3] ?? 12).getTime(), new Date(b[0], b[1], b[2], b[3] ?? 12).getTime(), NOW);
assert.equal(dr([2026, 4, 18, 9], [2026, 4, 18, 22]), 'May 18'); // one local day
assert.equal(dr([2026, 4, 18, 23], [2026, 4, 19, 0]), 'May 18–19'); // past local midnight = two days
assert.equal(dr([2026, 4, 12], [2026, 4, 18]), 'May 12–18'); // same month
assert.equal(dr([2026, 4, 28], [2026, 5, 2]), 'May 28–Jun 2'); // across months, <= 45 days
assert.equal(dr([2026, 8, 1], [2026, 10, 20]), 'Sep–Nov'); // longer
assert.equal(dr([2024, 4, 18], [2024, 4, 18]), 'May 18, 2024'); // year only when not this year
assert.equal(dr([2024, 4, 12], [2024, 4, 18]), 'May 12–18, 2024');
assert.equal(dr([2024, 4, 28], [2024, 5, 2]), 'May 28–Jun 2, 2024');
assert.equal(dr([2024, 8, 1], [2024, 10, 20]), 'Sep–Nov 2024');
assert.equal(dr([2024, 11, 5], [2025, 2, 3]), 'Dec 2024–Mar 2025'); // across years
assert.equal(dr([2023, 1, 1], [2025, 5, 1]), '2023–2025'); // > 12 months
assert.equal(dr([2026, 4, 18], [2026, 4, 12]), 'May 12–18'); // order-proof
assert.equal(dateRange(new Date(2025, 0, 1).getTime(), new Date(2025, 5, 1).getTime()), 'Jan–Jun 2025');

// duplicate titles get the shortest suffix that tells them apart
const st = (title: string, a: [number, number, number], b: [number, number, number]) => ({ title, start: new Date(...a).getTime(), end: new Date(...b).getTime() });
assert.deepEqual(disambiguate([st('Coffee', [2024, 4, 1], [2024, 4, 9]), st('Coffee', [2025, 4, 1], [2025, 4, 9]), st('Tea', [2025, 1, 1], [2025, 1, 2])], NOW).map((s) => s.title),
  ['Coffee, 2024', 'Coffee, 2025', 'Tea']);
assert.deepEqual(disambiguate([st('Coffee', [2025, 3, 1], [2025, 3, 9]), st('Coffee', [2025, 9, 1], [2025, 9, 9])], NOW).map((s) => s.title),
  ['Coffee, spring 2025', 'Coffee, autumn 2025']);
assert.deepEqual(disambiguate([st('Coffee', [2026, 3, 1], [2026, 3, 3]), st('Coffee', [2026, 3, 10], [2026, 3, 12])], NOW).map((s) => s.title),
  ['Coffee, Apr 1–3', 'Coffee, Apr 10–12']);
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

// Create search: places the library has (n-grams), month / season / year / today -> date filter, the rest -> CLIP
const isPl = (w: string) => ['paris', 'new york', 'turkey'].includes(w);
const pq = parseQuery('Paris picnic May', isPl);
assert.deepEqual([pq.places, [...pq.months!], pq.years, pq.clip], [['paris'], [4], null, 'picnic']);
const pq2 = parseQuery('summer 2024 beach in new york', isPl);
assert.deepEqual([pq2.places, [...pq2.months!].sort(), [...pq2.years!], pq2.clip], [['new york'], [5, 6, 7], [2024], 'beach in']);
assert.equal(parseQuery('rome', isPl).clip, 'rome');
assert.deepEqual(parseQuery('Izmir', (w) => w === placeKey('İzmir')).places, ['izmir']); // accents / Turkish İ fold away // a place the library lacks stays a CLIP word
assert.equal(parseQuery('yesterday', isPl, new Date(2026, 9, 20, 9).getTime()).day, new Date(2026, 9, 19).toDateString());
{
  // Paris in May 2026, Paris in June, Istanbul in May; filters only -> newest first; CLIP word -> by score
  const ph = [photo(new Date(2026, 4, 3).getTime(), 48.85, 2.35), photo(new Date(2026, 5, 3).getTime(), 48.85, 2.35),
    photo(new Date(2026, 4, 9).getTime(), 41.01, 28.97), photo(new Date(2026, 4, 20).getTime(), 48.86, 2.34)];
  const v = [vec(1, 0), vec(1, 0), vec(1, 0), vec(0, 1)];
  const L = { photos: ph, vecs: new Float32Array(ph.length * 512), conceptNames: [], hasClip: true };
  v.forEach((x, i) => L.vecs.set(x, i * 512));
  const yes = (w: string) => ['paris', 'france', 'istanbul'].includes(w);
  assert.deepEqual(searchLibrary(L, parseQuery('paris may', yes), null), [3, 0]);
  assert.deepEqual(searchLibrary(L, parseQuery('', yes), null), [3, 2, 1, 0]);
  assert.deepEqual(searchLibrary(L, parseQuery('may picnic', yes), vec(1, 0)), [2, 0]); // 3 scores 0 (outside the band)
  assert.deepEqual(searchLibrary(L, parseQuery('picnic', yes), null), []); // CLIP words but no CLIP
  assert.deepEqual(searchLibrary(L, parseQuery('may picnic', yes), [vec(0, 1), vec(1, 0)]), [3, 2, 0]); // each photo's best of the query + its translation
}

// Create's "N sets": X on axis 0; moment A (4 photos, an hour apart) and moment B (3, a day later) lean off it, every
// photo its own extra axis (no near-duplicates); 3 lone photos days apart, closer to X than A or B; one near-copy of X.
// fillSets -> the lone ones as "Different moments" first (best match), then A and B; disjoint, never X or its copy.
{
  const xs = [vec(1, 0, 0, 0.1), vec(1, 0, 0, -0.1)];
  const at = (a: number, b: number) => vec(...Array.from({ length: b + 1 }, (_, j) => (j === 0 ? 1 : j === a ? 0.8 : j === b ? 0.6 : 0)));
  const when = [base, base + D, base + H, base + 2 * H, base + 3 * H, base + 4 * H, base + 2 * D, base + 2 * D + H, base + 2 * D + 2 * H,
    base + 5 * D, base + 8 * D, base + 11 * D, base];
  const all = [...xs, ...[0, 1, 2, 3].map((j) => at(1, 10 + j)), ...[0, 1, 2].map((j) => at(2, 20 + j)), ...[0, 1, 2].map((j) => vec(...Array.from({ length: 31 + j }, (_, k) => (k === 0 ? 1 : k === 3 || k === 30 + j ? 0.3 : 0)))), vec(1, 0, 0, 0.1, 0.02)];
  const ph = all.map((_, i) => photo(when[i]));
  const L = { photos: ph, vecs: new Float32Array(all.length * 512), conceptNames: [], hasClip: true };
  all.forEach((x, i) => L.vecs.set(x, i * 512));
  const X = [ph[0].id, ph[1].id];
  const sets = fillSets(L, X);
  const ids = sets.map((st) => st.photos.map((p) => ph.indexOf(p)).sort((m, n) => m - n));
  assert.deepEqual(sets[0].name, 'Different moments');
  assert.deepEqual(ids[0], [9, 10, 11]);
  assert.deepEqual(ids.slice(1).sort((m, n) => m.length - n.length), [[6, 7, 8], [2, 3, 4, 5]]);
  assert.equal(new Set(ids.flat()).size, ids.flat().length); // disjoint
  assert.ok(!ids.flat().some((i) => i < 2 || i === 12));
  assert.deepEqual(fillSets(L, []), []);
  assert.ok(!similarTo(L, X, 8).some((p) => p.id === ph[12].id || X.includes(p.id)));
}
// one-off shots (a coffee a day, 12 days): no moment has 2 photos, so 3 mixed sets of 5, 5, 2
{
  const all = [vec(1, 0, 0, 0.1), ...Array.from({ length: 12 }, (_, j) => vec(...Array.from({ length: 41 + j }, (_, k) => (k === 0 ? 1 : k === 40 + j ? 0.7 : 0))))];
  const ph = all.map((_, i) => photo(base + i * D));
  const L = { photos: ph, vecs: new Float32Array(all.length * 512), conceptNames: [], hasClip: true };
  all.forEach((x, i) => L.vecs.set(x, i * 512));
  const sets = fillSets(L, [ph[0].id]);
  assert.deepEqual(sets.map((st) => [st.name, st.photos.length]), [['Different moments', 5], ['More moments', 5], ['More moments', 2]]);
}

// dumps (Library rows, search, Reuse)
assert.equal(copyTitle('Paris', ['Paris']), 'Paris (2)');
assert.equal(copyTitle('Paris (2)', ['Paris', 'Paris (2)']), 'Paris (3)');
assert.equal(copyTitle('Paris', ['Paris (2)', 'Paris (3)']), 'Paris (4)');
const DN = new Date(2026, 9, 20, 15).getTime();
const dump = (o: Partial<Dump>): Dump => ({
  id: 'd_x', title: 'Late summer', status: 'draft', source: 'story', storyId: null, ratio: '4:5', fit: null, layout: null, filter: null,
  caption: null, platform: null, created: DN, edited: DN, postedAt: null,
  photos: [{ id: '1', uri: 'u1', created: new Date(2026, 8, 12, 9).getTime() }, { id: '2', uri: 'u2', created: new Date(2026, 8, 18, 22).getTime() }], ...o,
});
assert.equal(kindLabel(dump({})), 'Dump · 4:5');
assert.equal(kindLabel(dump({ layout: '2×2 Grid' })), 'Collage · 2×2 Grid');
assert.equal(kindLabel(dump({ layout: 'grid' })), 'Collage · 2×2 Grid');
assert.equal(kindLabel(dump({ layout: 'single' })), 'Dump · 4:5');
assert.equal(rowLine(dump({}), DN), '2 photos · Sep 12–18 · Edited today');
assert.equal(statusLine(dump({ edited: new Date(2026, 9, 19, 23).getTime() }), DN), 'Edited yesterday');
assert.equal(statusLine(dump({ edited: new Date(2026, 9, 2).getTime() }), DN), 'Edited Oct 2');
assert.equal(statusLine(dump({ status: 'posted', platform: 'instagram', postedAt: new Date(2026, 8, 29).getTime() }), DN), 'Shared to IG · Sep 29');
assert.equal(statusLine(dump({ status: 'posted', platform: 'tiktok', postedAt: new Date(2025, 8, 29).getTime() }), DN), 'Shared to TikTok · Sep 29, 2025');
assert.equal(statusLine(dump({ status: 'posted', platform: null, postedAt: new Date(2026, 8, 29).getTime() }), DN), 'Shared · Sep 29'); // via the chooser
assert.equal(rowLine(dump({ photos: [{ id: 's', uri: 's' }] }), DN), '1 photo · Oct 20 · Edited today'); // no photo dates: the day it was made
assert.ok(matches(dump({}), 'late SEP', DN));
assert.ok(matches(dump({}), '  ', DN));
assert.ok(!matches(dump({}), 'late winter', DN));

// layouts: photos chunk in order, no repeats, nothing dropped; a short last slide falls back to fewer cells
const six = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
for (const l of LAYOUTS) {
  const slides = chunk(six, l.key);
  assert.deepEqual(slides.flatMap((s) => s.photos), six, l.key);
  for (const s of slides) assert.equal(slideCells(s.layout, DEFAULT_FRAME, 1080, 1350).cells.length, s.photos.length, `${l.key} cells`);
}
assert.deepEqual(chunk(six, 'grid').map((s) => [s.layout, s.photos.length]), [['grid', 4], ['bento', 3]]);
assert.deepEqual(chunk(six, 'split').map((s) => s.layout), ['split', 'split', 'split', 'single']);
assert.deepEqual(chunk([], 'grid'), []);
assert.deepEqual(exportSize('9:16'), { width: 1080, height: 1920 });
assert.deepEqual(exportSize('4:5', true), { width: 2160, height: 2700 });
assert.deepEqual(exportSize('nope'), { width: 1080, height: 1350 });
{ // crop: centred = plain cover; a far-off centre stops at the photo's edge (no gap); zoom clamps to 1..4
  const c = placePhoto(900, 1600, 4000, 3000); // 4:3 photo in a 9:16 cell
  assert.deepEqual([c.dh, c.dy, c.dx], [1600, 0, (900 - c.dw) / 2]);
  const left = placePhoto(900, 1600, 4000, 3000, { x: 0, y: 0.5, z: 1 });
  assert.equal(left.dx, 0);
  assert.ok(Math.abs(placePhoto(900, 1600, 4000, 3000, { x: 9, y: 0.5, z: 1 }).dx - (900 - c.dw)) < 1e-6);
  assert.equal(placePhoto(900, 1600, 4000, 3000, { x: 0.5, y: 0.5, z: 0.2 }).crop.z, 1);
  assert.equal(placePhoto(900, 1600, 4000, 3000, { x: 0.5, y: 0.5, z: 9 }).crop.z, 4);
  const { cells } = slideCells('split', DEFAULT_FRAME, 1080, 1350);
  assert.deepEqual([cellAt(cells, 'split', 10, 10), cellAt(cells, 'split', 1070, 10)], [0, 1]);
  assert.equal(cellAt(slideCells('scrapbook', DEFAULT_FRAME, 1080, 1350).cells, 'scrapbook', 540, 675), 0); // cover on top
}
{ // cells stay inside the slide; border insets them
  const W = 1080, H = 1350;
  for (const l of LAYOUTS) for (const fit of ['bleed', 'border', 'blur'] as const) for (const c of slideCells(l.key, { ...DEFAULT_FRAME, fit, gap: 12, corners: 16 }, W, H).cells) {
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= W + 1e-6 && c.y + c.h <= H + 1e-6, `${l.key} ${fit} in bounds`);
  }
  assert.ok(slideCells('single', frameOf('border'), W, H).cells[0].x > 40);
  // gap and corners in mock px: 0 gap = touching halves, corners round every cell
  const tight = slideCells('split', { ...DEFAULT_FRAME, gap: 0, corners: 8 }, W, H).cells;
  assert.equal(tight[1].x, tight[0].w);
  assert.equal(tight[0].r, (8 * W) / 288);
  assert.equal(slideCells('single', DEFAULT_FRAME, W, H).cells[0].w, W);
  // scrapbook: tilted prints (rotated corners included) keep >= 12 mock px of matte on every ratio
  for (const [w, h] of [[1080, 1350], [1080, 1080], [1080, 1920], [1080, 1440]]) for (const fit of ['bleed', 'border'] as const) {
    const { inner, cells } = slideCells('scrapbook', { ...DEFAULT_FRAME, fit }, w, h);
    const m = (12 * w) / 288 - 1e-6;
    for (const c of cells) {
      const r = (Math.abs(c.rot) * Math.PI) / 180, cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      const hx = (c.w * Math.cos(r) + c.h * Math.sin(r)) / 2, hy = (c.w * Math.sin(r) + c.h * Math.cos(r)) / 2;
      assert.ok(cx - hx >= inner.x + m && cy - hy >= inner.y + m && cx + hx <= inner.x + inner.w - m && cy + hy <= inner.y + inner.h - m, `scrapbook ${w}x${h} ${fit} margin`);
    }
    assert.ok(cells[0].h / cells[0].w <= 1.85, `scrapbook ${w}x${h} cover not a strip`);
  }
}

// filters: 0% (and Original) = untouched; every preset at 0 is the identity matrix; B&W at 100% has equal r/g/b rows
const close = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
for (const p of PRESETS) {
  assert.ok(close(p.matrix(0), IDENTITY), `${p.key} at 0% is identity`);
  assert.equal(matrixFor({ key: p.key, pct: 0 }), null);
}
assert.equal(matrixFor({ key: 'none', pct: 80 }), null);
const bw = matrixFor({ key: 'noir', pct: 100 })!;
assert.ok(close(bw.slice(0, 5), bw.slice(5, 10)) && close(bw.slice(5, 10), bw.slice(10, 15)));
assert.ok(close(bw.slice(15), [0, 0, 0, 1, 0])); // alpha untouched
const w68 = matrixFor({ key: 'warm35', pct: 68 })!;
assert.ok(w68[0] > w68[10] && w68.length === 20); // warm: red gains more than blue
// a photo's own look wins, the rest follow the dump's; rows from before per-photo looks read the same
const fs = { key: 'warm35' as const, pct: 68, per: { p1: { key: 'noir' as const, pct: 50 } }, adj: {} };
assert.equal(lookFor(fs, 'p1').key, 'noir');
assert.equal(lookFor(fs, 'p2').key, 'warm35');
assert.deepEqual(filterOf({ key: 'noir', pct: 40, all: true, per: {} }), { key: 'noir', pct: 40, per: {}, adj: {} });
assert.deepEqual(filterOf(null), DEFAULT_FILTER);
assert.deepEqual(filterOf({ key: 'noir', pct: 40, grain: 30, fade: 0, per: {}, adj: { p1: { light: 20 } } }), { key: 'noir', pct: 40, grain: 30, per: {}, adj: { p1: { light: 20 } } });
// develop: nothing set = untouched; Adjust is per photo; Light raises the diagonal; Fade lifts black; texture rides the look
assert.deepEqual(developFor(DEFAULT_FILTER, 'p1'), { matrix: null, shadows: 0, sharpen: 0, grain: 0, vignette: 0 });
const dev = developFor({ ...DEFAULT_FILTER, fade: 50, grain: 40, adj: { p1: { light: 50, shadows: -20, sharpen: 30 } } }, 'p1');
assert.ok(dev.matrix && dev.matrix[0] > 1 - 0.1 && dev.matrix[4] > 0, 'light + fade');
assert.deepEqual([dev.shadows, dev.sharpen, dev.grain], [-0.2, 0.3, 0.4]);
assert.equal(developFor({ ...DEFAULT_FILTER, adj: { p1: { light: 50 } } }, 'p2').matrix, null);
// Auto / Brighten: a dark photo brightens, a bright one darkens, a blue cast warms up
const dark = { mean: 0.18, sd: 0.1, lo: 0.3, hi: 0, cast: 0.1 };
assert.ok(isDark(dark) && !isDark({ ...dark, mean: 0.5 }));
const a = autoAdjust(dark);
assert.ok(a.light! > 30 && a.shadows! > 30 && a.warmth! > 0 && a.contrast! > 0);
assert.ok(autoAdjust({ ...dark, mean: 0.8, lo: 0 }).light! < 0);
assert.ok(brighten({ ...dark, mean: 0.33, lo: 0 }, { warmth: 5 }).light! >= 25 && brighten(dark, { warmth: 5 }).warmth === 5);
// frame: old 'border' / 'bleed' rows read as Matte / Fill; the JSON round-trips; junk falls back
assert.deepEqual(frameOf('border'), { ...DEFAULT_FRAME, fit: 'border' });
assert.deepEqual(frameOf(null), DEFAULT_FRAME);
const fr = { fit: 'blur' as const, gap: 6, corners: 4, matte: 'kraft' as const, guide: false };
assert.deepEqual(frameOf(frameText(fr)), fr);
assert.deepEqual(frameOf('{nope'), DEFAULT_FRAME);

// an undated photo (created 0) must not stretch the range back to 1970
const jun = new Date(2026, 5, 13).getTime();
assert.equal(photoRange({ photos: [{ id: 'a', uri: 'a', created: 0 }, { id: 'b', uri: 'b', created: jun }], created: jun }, jun),
  photoRange({ photos: [{ id: 'b', uri: 'b', created: jun }], created: jun }, jun));

// Post / Save only pipeline with the native steps faked: order, the exact share arguments, what gets marked Posted
async function posting() {
  const calls: string[] = [];
  const fake = (o: { share?: string; album?: boolean; fail?: boolean; markFail?: boolean } = {}): PostDeps => ({
    exportSlides: async (d) => { calls.push(`export ${d.id}`); return ['file:///c/export/1.jpg', 'file:///c/export/2.jpg']; },
    saveToAlbum: async (u) => { calls.push(`album ${u.length}`); if (o.album === false) throw new Error('denied'); },
    share: async (u, target) => { calls.push(`share ${u.join(',')} | ${target}`); if (o.fail) throw new Error('no activity'); return o.share ?? 'com.instagram.android'; },
    persist: async (d) => { calls.push(`persist ${d.id}`); return { ...d, id: 'd_new' }; },
    markPosted: async (id, platform) => { calls.push(`posted ${id} ${platform}`); if (o.markFail) throw new Error('db'); },
  });
  const draft = dump({ id: 'd_1' });
  let r = await postDump(fake(), draft, 'instagram');
  assert.deepEqual(calls.splice(0), [
    'export d_1', 'share file:///c/export/1.jpg,file:///c/export/2.jpg | instagram', 'album 2', 'posted d_1 instagram',
  ]);
  assert.deepEqual(r, { to: 'com.instagram.android', saved: true, marked: true, slides: 2, id: 'd_1' });
  // a story preview gets its draft only once the share opened; the chooser (no TikTok app) posts with no platform
  r = await postDump(fake({ share: 'chooser' }), dump({ id: 'trip:paris' }), 'tiktok');
  assert.deepEqual(calls.splice(0).slice(1), ['share file:///c/export/1.jpg,file:///c/export/2.jpg | tiktok', 'album 2', 'persist trip:paris', 'posted d_new null']);
  assert.equal(r.id, 'd_new');
  // "Posting also saves to gallery" off: no album step
  r = await postDump(fake(), draft, 'instagram', false, false);
  assert.equal(r.saved, false);
  assert.ok(!calls.splice(0).some((c) => c.startsWith('album')));
  // album refused: still posts; share failed: nothing marked, error surfaces
  r = await postDump(fake({ album: false }), draft, 'instagram');
  assert.equal(r.saved, false);
  assert.ok(calls.splice(0).some((c) => c.startsWith('posted')));
  await assert.rejects(postDump(fake({ fail: true }), draft, 'instagram'));
  assert.ok(!calls.splice(0).some((c) => c.startsWith('posted') || c.startsWith('persist')));
  // the app already opened: a mark failure is reported (marked = false), not thrown as "couldn't open"
  r = await postDump(fake({ markFail: true }), draft, 'instagram');
  assert.equal(r.marked, false);
  calls.splice(0);
  // Save only: export + album, never share or mark; a story preview gets its draft
  assert.deepEqual(await saveOnly(fake(), draft), { slides: 2, id: 'd_1' });
  assert.deepEqual(calls.splice(0), ['export d_1', 'album 2']);
  assert.deepEqual(await saveOnly(fake(), dump({ id: 'topic:2740:1749039660000' })), { slides: 2, id: 'd_new' });
  assert.deepEqual(calls.splice(0), ['export topic:2740:1749039660000', 'album 2', 'persist topic:2740:1749039660000']);
}

/** Settles once every check ran; __tests__/selfcheck.test.ts awaits it under jest. */
export const done = posting();
done.then(() => console.log('selfcheck ok'), (e) => { console.error(e); process.exitCode = 1; });
