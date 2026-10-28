import type { PhotoAsset } from '../../types';
import type { Library } from '../index/photoIndex';
import { DIM, dot, isZero } from '../index/vectors';

/**
 * Replacement candidates for one slide, best first: library photos closest (CLIP cosine) to that slide plus the
 * set's centroid, skipping photos already in the set and near-duplicates of them. Without embeddings, nearest in time.
 * pool: only these photo ids are candidates (a free user's dump draws from its own story, not the whole library).
 */
export function suggestSwaps(lib: Library, set: PhotoAsset[], target: PhotoAsset, k = 12, pool?: Set<string>): PhotoAsset[] {
  const row = new Map(lib.photos.map((p, i) => [p.id, i]));
  const inSet = new Set(set.map((p) => p.id));
  const setRows = set.map((p) => row.get(p.id)).filter((i): i is number => i != null && !isZero(lib.vecs, i));
  const t = row.get(target.id);
  const cands = lib.photos.map((_, i) => i).filter((i) => !inSet.has(lib.photos[i].id) && (!pool || pool.has(lib.photos[i].id)));

  if (t == null || isZero(lib.vecs, t)) {
    const dt = (i: number) => Math.abs(lib.photos[i].creationTime - target.creationTime);
    return cands.sort((a, b) => dt(a) - dt(b)).slice(0, k).map((i) => lib.photos[i]);
  }

  const c = new Float32Array(DIM);
  for (const r of setRows) for (let j = 0; j < DIM; j++) c[j] += lib.vecs[r * DIM + j];
  const norm = Math.hypot(...c) || 1;
  for (let j = 0; j < DIM; j++) c[j] /= norm;

  const scored = cands
    .filter((i) => !isZero(lib.vecs, i))
    .map((i) => ({ i, s: dot(lib.vecs, i, lib.vecs, t) + dot(lib.vecs, i, c, 0) }))
    .sort((a, b) => b.s - a.s);
  const out: number[] = [];
  for (const { i } of scored) {
    if (out.length >= k) break;
    if (![...setRows, ...out].some((r) => dot(lib.vecs, i, lib.vecs, r) > 0.95)) out.push(i);
  }
  return out.map((i) => lib.photos[i]);
}
