import type { Face } from '../../modules/clip-embedder';
import { b64ToFloats } from './index/vectors';

/** SFace: same person when the cosine of two features is above this (OpenCV's threshold). */
export const SAME_PERSON = 0.363;

export const faceVec = (f: Face) => (f.vec ? b64ToFloats(f.vec) : null);

const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let j = 0; j < a.length; j++) s += a[j] * b[j]; return s; };

/**
 * Greedy grouping of L2-normalized face vectors into people: each face joins the closest group whose mean is above
 * SAME_PERSON, else starts one. Returns the group of every face; groups are numbered by first appearance.
 * ponytail: one pass, order-dependent, O(faces × groups); agglomerative clustering if groups split or merge badly.
 */
export function groupFaces(vecs: Float32Array[], thr = SAME_PERSON): number[] {
  const sums: Float32Array[] = [];
  const means: Float32Array[] = [];
  return vecs.map((v) => {
    let best = -1, bestS = thr;
    means.forEach((m, g) => { const s = dot(v, m); if (s > bestS) { best = g; bestS = s; } });
    if (best < 0) { sums.push(new Float32Array(v)); means.push(new Float32Array(v)); return means.length - 1; }
    const sum = sums[best];
    for (let j = 0; j < v.length; j++) sum[j] += v[j];
    const n = Math.sqrt(dot(sum, sum));
    for (let j = 0; j < v.length; j++) means[best][j] = sum[j] / n;
    return best;
  });
}

/** 1 for a face in the middle of the photo (a bit above center, where selfies put it), 0 at an edge. */
export const centered = (f: Face) => Math.max(0, 1 - 2 * Math.abs(f.x + f.w / 2 - 0.5)) * Math.max(0, 1 - 2 * Math.abs(f.y + f.h / 2 - 0.45));
