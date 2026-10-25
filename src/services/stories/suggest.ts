// Create's suggestions from the basket: the "Similar to your N selected" strip and (P6b) the two Y sets of
// "2 ways to finish". Pure (type-only imports), so scripts/selfcheck.ts can test it.
import type { IndexedPhoto, Library } from '../index/photoIndex';
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

/**
 * Two different ways to finish the dump from the same selection (decisions.md "X+Y"): the top CLIP neighbours of the
 * selection, split in two by 2-means (cosine), the best `size` of each cluster. Y1 ∩ Y2 = ∅ always; a short cluster
 * tops up from photos the other Y didn't take. `exclude` = earlier picks, so Regenerate gives new sets. ms = timing.
 */
export function finishSets(lib: Library, selected: string[], size: number, exclude: Set<string> = new Set()): { ys: [IndexedPhoto[], IndexedPhoto[]]; ms: number } {
  const t0 = Date.now();
  const pool = neighbours(lib, selected, Math.max(24, size * 6), { exclude });
  if (!pool.length || size <= 0) return { ys: [[], []], ms: Date.now() - t0 };

  // 2-means seeded with the best neighbour and the pool row least like it; pool order (best first) stays the rank.
  const far = pool.reduce((a, b) => (dot(lib.vecs, b, lib.vecs, pool[0]) < dot(lib.vecs, a, lib.vecs, pool[0]) ? b : a));
  const cents: Float32Array[] = [pool[0], far].map((r) => lib.vecs.slice(r * DIM, (r + 1) * DIM));
  let side = pool.map(() => 0);
  for (let it = 0; it < 8; it++) {
    const next = pool.map((r) => (dot(lib.vecs, r, cents[1], 0) > dot(lib.vecs, r, cents[0], 0) ? 1 : 0));
    const moved = next.some((s, j) => s !== side[j]);
    side = next;
    for (const k of [0, 1]) {
      const c = new Float32Array(DIM);
      pool.forEach((r, j) => { if (side[j] === k) for (let d = 0; d < DIM; d++) c[d] += lib.vecs[r * DIM + d]; });
      if (side.includes(k)) cents[k] = unit(c);
    }
    if (!moved && it) break;
  }

  const taken = new Set<number>();
  const ys: [number[], number[]] = [[], []];
  const fill = (k: 0 | 1, from: number[]) => {
    for (const r of from) {
      if (ys[k].length >= size) return;
      if (!taken.has(r)) { ys[k].push(r); taken.add(r); }
    }
  };
  fill(0, pool.filter((_, j) => side[j] === 0));
  fill(1, pool.filter((_, j) => side[j] === 1));
  fill(0, pool);
  fill(1, pool);
  return { ys: [ys[0].map((r) => lib.photos[r]), ys[1].map((r) => lib.photos[r])], ms: Date.now() - t0 };
}

type Pick = { id: string };
/**
 * "Use this" on a way Y (generic so selfcheck needn't load dumps.ts): Y's photos join the end of the basket in place
 * of any other way the section placed; on a Y that's fully in already, the photos it placed come out again.
 * `placed` = ids the section put in (never the user's own picks, even when a Y holds them too).
 */
export function adoptWay<P extends Pick>(basket: P[], placed: Set<string>, y: P[]): { next: P[]; placed: Set<string> } {
  const ids = new Set(y.map((p) => p.id));
  const inBasket = new Set(basket.map((p) => p.id));
  if (y.length && y.every((p) => inBasket.has(p.id))) {
    return { next: basket.filter((p) => !(placed.has(p.id) && ids.has(p.id))), placed: new Set([...placed].filter((id) => !ids.has(id))) };
  }
  const keep = basket.filter((p) => !placed.has(p.id) || ids.has(p.id));
  const have = new Set(keep.map((p) => p.id));
  const add = y.filter((p) => !have.has(p.id));
  return { next: [...keep, ...add], placed: new Set([...[...placed].filter((id) => ids.has(id)), ...add.map((p) => p.id)]) };
}
