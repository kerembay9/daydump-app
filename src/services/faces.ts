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

/** Whether f is one of these people (SFace vectors); false without a vector (face model not downloaded). */
export const isAnyOf = (f: Face | undefined, people: Float32Array[]) => {
  const v = f && faceVec(f);
  return !!v && people.some((p) => dot(v, p) > SAME_PERSON);
};

/** 1 for a face in the middle of the photo (a bit above center, where selfies put it), 0 at an edge. */
export const centered = (f: Face) => Math.max(0, 1 - 2 * Math.abs(f.x + f.w / 2 - 0.5)) * Math.max(0, 1 - 2 * Math.abs(f.y + f.h / 2 - 0.45));

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The avatar's crop (FaceCircle, faceFile): the square around a face, ~2x its size and kept inside the photo, in photo heights. aspect: width / height. */
export function square(box: Face, aspect: number) {
  const side = Math.min(2 * Math.max(box.w * aspect, box.h), aspect, 1);
  const cx = clamp((box.x + box.w / 2) * aspect, side / 2, aspect - side / 2);
  const cy = clamp(box.y + box.h / 2, side / 2, 1 - side / 2);
  return { side, left: cx - side / 2, top: cy - side / 2 };
}

/**
 * How well a face makes a profile picture, 0..1: its avatar crop (square) gets the full margin around it (a face filling the
 * photo gets a tight, zoomed-in crop), the face sits in the crop's middle (not cut off at the photo's edge), and it's at least
 * 240 px tall (else the 512 px avatar blurs); times the detector's confidence. px: the photo's height in pixels.
 */
export function profileFit(f: Face, aspect: number, px: number) {
  const { side, left, top } = square(f, aspect);
  const room = side / (2 * Math.max(f.w * aspect, f.h));
  const off = Math.max(Math.abs((f.x + f.w / 2) * aspect - (left + side / 2)), Math.abs(f.y + f.h / 2 - (top + side / 2))) / side;
  return f.score * room * room * Math.max(0, 1 - 3 * off) * Math.min(1, (f.h * px) / 240);
}
