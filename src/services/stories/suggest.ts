// Create's suggestions from the basket: the "Similar to your picks" strip and its "N sets". No React or native
// imports, so scripts/selfcheck.ts can test it.
import type { IndexedPhoto, Library } from '../index/photoIndex';
import { placeFor } from '../index/cityLookup';
import { dateRange } from './titles';
import { DIM, dot, isZero } from '../index/vectors';

/** swaps.ts near-duplicate rule: cosine above this = the same shot. */
const DUP = 0.95;

const unit = (v: Float32Array) => {
  const n = Math.hypot(...v) || 1;
  for (let j = 0; j < DIM; j++) v[j] /= n;
  return v;
};

/** Embedded rows of the given ids, in order. */
function rowsOf(lib: Library, ids: string[]): number[] {
  const want = new Set(ids);
  const out: number[] = [];
  lib.photos.forEach((p, i) => { if (want.has(p.id) && !isZero(lib.vecs, i)) out.push(i); });
  return out;
}

/**
 * Library rows closest to the selection's centroid (plus the search query, when given), best first, skipping the
 * selection, `exclude`, and near-duplicates of the selection and of each other. [] when nothing selected is embedded.
 */
export function neighbours(lib: Library, selected: string[], k: number, opts: { exclude?: Set<string>; query?: Float32Array | null } = {}): number[] {
  const X = rowsOf(lib, selected);
  if (!X.length) return [];
  const c = new Float32Array(DIM);
  for (const r of X) for (let j = 0; j < DIM; j++) c[j] += lib.vecs[r * DIM + j];
  unit(c);
  const q = opts.query;
  const skip = new Set(selected);
  const scored: { i: number; s: number }[] = [];
  for (let i = 0; i < lib.photos.length; i++) {
    if (skip.has(lib.photos[i].id) || opts.exclude?.has(lib.photos[i].id) || isZero(lib.vecs, i)) continue;
    // the query nudges, the selection leads ("+ 'paris' vibe")
    scored.push({ i, s: dot(lib.vecs, i, c, 0) + (q ? 0.5 * dot(lib.vecs, i, q, 0) : 0) });
  }
  scored.sort((a, b) => b.s - a.s);
  const out: number[] = [];
  for (const { i } of scored) {
    if (out.length >= k) break;
    if (![...X, ...out].some((r) => dot(lib.vecs, i, lib.vecs, r) > DUP)) out.push(i);
  }
  return out;
}

/** "Similar to your N selected photos" strip. */
export const similarTo = (lib: Library, selected: string[], k = 8, query?: Float32Array | null): IndexedPhoto[] =>
  neighbours(lib, selected, k, { query }).map((i) => lib.photos[i]);

/** A ready-made group of photos to add, named by when / where it was taken. */
export type FillSet = { name: string; photos: IndexedPhoto[] };

/** a moment: photos less than 2 h apart */
const MOMENT = 2 * 3_600_000;

/**
 * Create's "N sets": the top 60 CLIP neighbours of the selection, cut into moments (time gaps). The two strongest
 * moments with 2+ photos become sets (≤5 each, "Kadıköy, Aug 12"); the best photo of each other moment fills
 * "Different moments" / "More moments" sets up to 3 in all, so a library of one-off shots (a coffee a day) still gets
 * sets to compare. Sets are disjoint, the one with the best match first; [] when nothing selected is embedded.
 * ponytail: fixed 2 h gap and 60-photo pool, tuned on one library; per-library gaps if moments come out wrong.
 */
export function fillSets(lib: Library, selected: string[], now = Date.now()): FillSet[] {
  const pool = neighbours(lib, selected, 60).map((i) => lib.photos[i]);
  const rank = new Map(pool.map((p, i) => [p.id, i]));
  const byTime = [...pool].sort((a, b) => a.creationTime - b.creationTime);
  const moments: IndexedPhoto[][] = [];
  byTime.forEach((p, i) => { if (!i || p.creationTime - byTime[i - 1].creationTime > MOMENT) moments.push([]); moments[moments.length - 1].push(p); });
  // each moment best first, the strongest moment first
  const ms = moments.map((m) => m.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)).sort((a, b) => rank.get(a[0].id)! - rank.get(b[0].id)!);
  const big = ms.filter((m) => m.length >= 2).slice(0, 2);
  const sets: FillSet[] = big.map((m) => ({ name: nameOf(m, now), photos: m.slice(0, 5) }));
  const mix = ms.filter((m) => !big.includes(m)).map((m) => m[0]);
  for (let i = 0; sets.length < 3 && mix.length - i >= 2; i += 5) {
    sets.push({ name: i ? 'More moments' : 'Different moments', photos: mix.slice(i, i + 5) });
  }
  // the set holding the best match first
  return sets.sort((a, b) => rank.get(a.photos[0].id)! - rank.get(b.photos[0].id)!);
}

/** "Kadıköy, Aug 12" (the first photo with GPS names the place), or just the dates. */
function nameOf(ps: IndexedPhoto[], now: number): string {
  const ts = ps.map((p) => p.creationTime);
  const at = ps.find((p) => p.location)?.location;
  const city = at && placeFor(at.latitude, at.longitude)?.city;
  const when = dateRange(Math.min(...ts), Math.max(...ts), now);
  return city ? `${city}, ${when}` : when;
}
