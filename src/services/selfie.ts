import { embedText, IndexedPhoto, Library } from './index/photoIndex';
import { dot } from './index/vectors';
import { searchRanked } from './stories';
import { isCameraPhoto } from './galleryService';

export const SELFIE_QUERY = 'a selfie of a person, close-up face';
export type SelfieCandidate = { p: IndexedPhoto; clip: number; sharp: number; score: number };

/**
 * Dev experiment: the best selfie on the phone, on-device. CLIP's top 20 for SELFIE_QUERY (camera photos when there
 * are any), re-ranked by sharpness and orientation. Best first; [] without CLIP.
 * ponytail: "sharp" is CLIP's own sharp-vs-blurry text contrast, not a pixel measure; decode + Laplacian if it misranks.
 */
export async function findSelfies(lib: Library): Promise<SelfieCandidate[]> {
  const ranked = await searchRanked(lib, SELFIE_QUERY);
  const camera = ranked.filter((x) => isCameraPhoto(x.p.uri));
  const top = (camera.length ? camera : ranked).slice(0, 20);
  const [sharp, blurry] = await Promise.all([embedText('a sharp, in-focus photo'), embedText('a blurry, out-of-focus photo')]);
  const row = new Map(lib.photos.map((p, i) => [p.id, i]));
  return top
    .map(({ p, s }) => {
      const i = row.get(p.id)!;
      const q = sharp && blurry ? dot(lib.vecs, i, sharp, 0) - dot(lib.vecs, i, blurry, 0) : 0;
      // Phones shoot selfies upright; a small nudge, not a filter (EXIF-rotated sizes can be swapped).
      return { p, clip: s, sharp: q, score: s + 0.5 * q + (p.height > p.width ? 0.01 : 0) };
    })
    .sort((a, b) => b.score - a.score);
}
