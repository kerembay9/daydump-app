import { embedText, IndexedPhoto, Library } from './index/photoIndex';
import { dot } from './index/vectors';
import { searchRanked } from './stories';
import { isCameraPhoto } from './galleryService';
import { ClipEmbedder, type Face } from '../../modules/clip-embedder';
import { centered, faceVec, groupFaces } from './faces';

export const SELFIE_QUERY = 'a selfie of a person, close-up face';
/**
 * face: selfieFace (0 = not a selfie); box: that face; aspect: the photo's width / height; person: who it is among the
 * candidates (-1 = no selfie face) and seen: in how many candidate photos that person appears.
 */
export type SelfieCandidate = { p: IndexedPhoto; clip: number; sharp: number; score: number; face: number; box?: Face; aspect: number; person: number; seen: number };

/** A selfie has exactly one face covering >= 10% of the photo: its size × confidence, half again when centered; else 0. */
export const selfieFace = (faces: Face[]) => {
  const f = faces[0];
  return faces.length === 1 && f.w * f.h >= 0.1 ? f.w * f.h * f.score * (0.5 + 0.5 * centered(f)) : 0;
};

/**
 * The best selfie on the phone, on-device. CLIP's top 30 for SELFIE_QUERY (camera photos when there are any); YuNet finds
 * their faces and SFace groups them into people. Selfies (one big face) of the person in the most candidate photos come
 * first (the phone's owner takes the most selfies), then other people's, each by selfieFace; the rest by sharpness and
 * orientation. Best first; [] without CLIP.
 * Benchmarks: MODEL_BENCHMARKS.md, Face detection.
 * ponytail: "sharp" is CLIP's own sharp-vs-blurry text contrast, not a pixel measure; decode + Laplacian if it misranks.
 */
export async function findSelfies(lib: Library): Promise<SelfieCandidate[]> {
  const ranked = await searchRanked(lib, SELFIE_QUERY);
  const camera = ranked.filter((x) => isCameraPhoto(x.p.uri));
  const top = (camera.length ? camera : ranked).slice(0, 30);
  const [sharp, blurry] = await Promise.all([embedText('a sharp, in-focus photo'), embedText('a blurry, out-of-focus photo')]);
  const row = new Map(lib.photos.map((p, i) => [p.id, i]));
  // ~80 ms/photo on the A54, mostly decoding; no native module (iOS / Expo Go) = CLIP order only
  const scans = (await ClipEmbedder?.faces(top.map(({ p }) => p.uri), 0.6, true)) ?? [];
  const all = scans.flatMap((sc, k) => sc.faces.flatMap((f) => { const v = faceVec(f); return v ? [{ k, f, v }] : []; }));
  const group = groupFaces(all.map((x) => x.v));
  const photos = new Map<number, Set<number>>(); // person -> candidate photos they're in
  all.forEach((x, i) => photos.set(group[i], (photos.get(group[i]) ?? new Set()).add(x.k)));
  const personOf = new Map(all.map((x, i) => [x.f, group[i]]));
  return top
    .map(({ p, s }, k) => {
      const i = row.get(p.id)!;
      const q = sharp && blurry ? dot(lib.vecs, i, sharp, 0) - dot(lib.vecs, i, blurry, 0) : 0;
      const faces = scans[k]?.faces ?? [];
      const face = selfieFace(faces);
      const person = face ? personOf.get(faces[0]) ?? -1 : -1;
      // Phones shoot selfies upright; a small nudge, not a filter (EXIF-rotated sizes can be swapped).
      return { p, clip: s, sharp: q, score: s + 0.5 * q + (p.height > p.width ? 0.01 : 0), face, box: face ? faces[0] : undefined,
        aspect: scans[k]?.aspect ?? p.width / p.height, person, seen: photos.get(person)?.size ?? 0 };
    })
    .sort((a, b) => b.seen - a.seen || a.person - b.person || b.face - a.face || b.score - a.score);
}
