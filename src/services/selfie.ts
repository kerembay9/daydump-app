import { Platform } from 'react-native';
import { embedText, IndexedPhoto, Library } from './index/photoIndex';
import { b64ToFloats, dot } from './index/vectors';
import type { PhotoAsset } from '../types';
import { searchRanked } from './stories';
import { isCameraPhoto } from './galleryService';
import { ClipEmbedder, type Face } from '../../modules/clip-embedder';
import { centered, faceVec, groupFaces, isAnyOf, profileFit } from './faces';

// SELFIE_QUERY and the sharp/blurry phrases ship as vectors (FIXED_PHRASES, scripts/build_assets.py): change both together.
export const SELFIE_QUERY = 'a selfie of a person, close-up face';
/** Concept names (vocab.json) that mark a photo of a document or a screen, in a photo's top 5 concepts. */
const DOCUMENT = /passport|identity document|^a document$|license|certificate|^a screenshot$|picture frame|photo frame|poster$|newspaper/;
/** CLIP image cosine above which two photos count as the same shot (a burst, the same thing photographed twice). */
const SAME_SHOT = 0.92;
/** Not just you: a pet (YuNet finds cat faces too) or other people, in the top 5 concepts. */
const NOT_SOLO = /^(a pet (cat|dog)|cat|dog|pet|tom cat|a sleepy pet|a group of friends|a family gathering|family|people|crowd|hug|kiss|friendship|social group)$/;
/** Any cat or dog concept (not hot dogs): YuNet finds pet faces, and a pet close-up's top 5 can miss it ("reading, novel, curious…"). */
const PET = /(^|\s)(cats?|kitten|dogs?|puppy|pets?)(\s|$)/;
const NOT_PET = /hot dog|corn dog|cat fish/;
/** Top-5 concepts that make a poor profile picture (a gesture, a hand on the face, crying, eating, sick): its fit halves. */
const POOR_AVATAR = /middle finger|crying|tears|eating|patient|nursing|face mask|nose|eye drop|sleep/;
/** Before visionpack: the bundled gate's P(document, screen or pet) above which a photo is dropped (keeps 25 of 28 selfies on a Commons test set). */
const GATE = 0.14;
/** Before visionpack: gate-feature cosine above which two photos are the same shot (synthetic bursts: 56/56 caught, 1/378 distinct selfies merged). */
const GATE_SAME_SHOT = 0.9;
/** Before visionpack: ln(face Laplacian variance) -> CLIP's sharp-minus-blurry scale (selfies: median 5.0, p10-p90 3.2-6.4; CLIP q spans about ±0.03). */
const gateSharp = (lap: number) => (lap > 0 ? (0.03 * (Math.log(lap) - 5)) / 1.6 : 0);
const cos = (a: Float32Array, b: Float32Array) => { let s = 0; for (let j = 0; j < a.length; j++) s += a[j] * b[j]; return s; };
/** Faces this sure count as someone else in the photo (a turned or half-hidden face scores below the selfie's 0.6). */
const OTHER_FACE = 0.35;
/**
 * face: selfieFace (0 = not a selfie); box: that face; aspect: the photo's width / height; person: who it is among the
 * candidates (-1 = no selfie face) and seen: in how many candidate photos that person appears.
 */
export type SelfieCandidate = { p: IndexedPhoto; clip: number; sharp: number; score: number; face: number; box?: Face; aspect: number; person: number; seen: number };

/** A selfie has exactly one face (scanned at OTHER_FACE), sure (>= 0.6) and covering >= 10% of the photo: its size × confidence, half again when centered; else 0. */
export const selfieFace = (faces: Face[]) => {
  const f = faces[0];
  return faces.length === 1 && f.score >= 0.6 && f.w * f.h >= 0.1 ? f.w * f.h * f.score * (0.5 + 0.5 * centered(f)) : 0;
};

/**
 * The best selfie on the phone, on-device. CLIP's top 30 for SELFIE_QUERY (camera photos when there are any), minus
 * photos of documents (a passport photo is no profile picture) and pets and near-copies of a better one (bursts); YuNet finds
 * their faces and SFace groups them into people. Only solo selfies come back (one big face): [] when none of the 30 is. Selfies (one big face) of the person in the most candidate photos come
 * first (the phone's owner takes the most selfies), then other people's, each by selfieFace; the rest by sharpness and
 * orientation. Best first; [] without CLIP. embed = false (face model not downloaded yet): no grouping, the biggest
 * single face wins. not: photos already looked at (the 30 are added to it, so the next call moves on) and faces turned
 * down.
 * Benchmarks: MODEL_BENCHMARKS.md, Face detection.
 * ponytail: "sharp" is CLIP's own sharp-vs-blurry text contrast, not a pixel measure; decode + Laplacian if it misranks.
 */
export async function findSelfies(lib: Library, embed = true, not?: { ids: Set<string>; faces: Float32Array[] }): Promise<SelfieCandidate[]> {
  const ranked = await searchRanked(lib, SELFIE_QUERY);
  const camera = ranked.filter((x) => isCameraPhoto(x.p.uri));
  const row = new Map(lib.photos.map((p, i) => [p.id, i]));
  const ids = (re: RegExp) => new Set(lib.conceptNames.flatMap((n, id) => (re.test(n) ? [id] : [])));
  const doc = ids(DOCUMENT), notSolo = ids(NOT_SOLO);
  const top: typeof ranked = [];
  for (const x of camera.length ? camera : ranked) {
    if (top.length === 30) break;
    if (not?.ids.has(x.p.id)) continue;
    const i = row.get(x.p.id)!;
    if (x.p.concepts.slice(0, 5).some((c) => doc.has(c))) continue;
    if (x.p.concepts.slice(0, 5).some((c) => notSolo.has(c))) continue;
    if (top.some((y) => dot(lib.vecs, i, lib.vecs, row.get(y.p.id)!) > SAME_SHOT)) continue;
    top.push(x);
  }
  const [sharp, blurry] = await Promise.all([embedText('a sharp, in-focus photo'), embedText('a blurry, out-of-focus photo')]);
  // ~80 ms/photo on the A54, mostly decoding; no native module (iOS / Expo Go) = no faces, so no candidates
  const scans = (await ClipEmbedder?.faces(top.map(({ p }) => p.uri), OTHER_FACE, embed)) ?? [];
  const all = scans.flatMap((sc, k) => sc.faces.flatMap((f) => { if (f.score < 0.6) return []; const v = faceVec(f); return v ? [{ k, f, v }] : []; }));
  const group = groupFaces(all.map((x) => x.v));
  const photos = new Map<number, Set<number>>(); // person -> candidate photos they're in
  all.forEach((x, i) => photos.set(group[i], (photos.get(group[i]) ?? new Set()).add(x.k)));
  const personOf = new Map(all.map((x, i) => [x.f, group[i]]));
  const cands = top
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
  top.forEach((x) => not?.ids.add(x.p.id));
  return cands.filter((c) => c.face > 0 && !isAnyOf(c.box, not?.faces ?? []));
}

/**
 * A solo selfie checkSelfies found. fit: how good a profile picture it makes (profileFit, times sharpness); sharp: CLIP's
 * sharp-minus-blurry score (before visionpack: gateSharp); vec: its CLIP vector, or gate feature before visionpack (near-copy check); tags: its top 5 concepts (logs).
 */
export type Selfie = { p: PhotoAsset; face: number; fit: number; sharp: number; box: Face; aspect: number; vec: Float32Array; tags: string[] };
let names: Promise<string[]> | undefined;
// the sharp / blurry phrases ship as vectors (FIXED_PHRASES): no text pack needed
let focus: Promise<(Float32Array | null)[]> | undefined;

/**
 * Solo selfies without waiting for the photo index (CLIP reads ~55 ms/photo; the owner's selfies can be 900 photos back), in
 * two steps the caller can overlap: soloPhotos runs YuNet on MediaStore's cached thumbnails to find the photos with one big
 * face; checkSelfies decodes only those, once (selfieCheck): YuNet again (sharper box; SFace with embed) and CLIP, to drop
 * documents and other people (top 5 concepts), pets (top 20) and near-copies of one in `seen` (kept ones are added to it).
 * Before the vision pack lands, the bundled gate (MobileNetV3) stands in: it drops documents, screens and pets (GATE), its
 * feature finds near-copies (GATE_SAME_SHOT) and the face's Laplacian replaces CLIP's sharpness; no poor-avatar check.
 * Android only: [] elsewhere.
 * ponytail: what was picked before visionpack isn't rechecked with CLIP when it lands; rescan the pool if gate misses show up.
 */
export async function soloPhotos(photos: PhotoAsset[]): Promise<PhotoAsset[]> {
  if (!ClipEmbedder || Platform.OS !== 'android' || !photos.length) return [];
  const thumbs = await ClipEmbedder.faces(photos.map((p) => `content://media/external/images/media/${p.id}`), OTHER_FACE, false, 320);
  return photos.filter((_, k) => selfieFace(thumbs[k]?.faces ?? []) > 0);
}

export async function checkSelfies(solo: PhotoAsset[], embed: boolean, seen: Float32Array[]): Promise<Selfie[]> {
  if (!ClipEmbedder || !solo.length) return [];
  const [{ scans, vecs: b64, reject, gateVecs, sharp: lap }, cn, [sharp, blurry]] = await Promise.all([ClipEmbedder.selfieCheck(solo.map((p) => p.uri), OTHER_FACE, embed),
    (names ??= ClipEmbedder.conceptNames()), (focus ??= Promise.all([embedText('a sharp, in-focus photo'), embedText('a blurry, out-of-focus photo')]).catch(() => [null, null]))]);
  const top = b64 ? await ClipEmbedder.topConcepts(b64, 20) : { ids: [] as number[] }; // "": no visionpack yet, the gate scored them
  const vecs = b64 ? b64ToFloats(b64) : null;
  const gv = !vecs && gateVecs ? b64ToFloats(gateVecs) : null;
  return solo.flatMap((p, k) => {
    const faces = scans[k]?.faces ?? [], face = selfieFace(faces);
    const tags20 = top.ids.slice(k * 20, k * 20 + 20).map((id) => cn[id]), tags = tags20.slice(0, 5);
    const vec = vecs ? vecs.slice(k * 512, (k + 1) * 512) : gv ? gv.slice(k * 1024, (k + 1) * 1024) : new Float32Array(0);
    const drop = !face ? 'no solo face' : !vecs && reject[k] > GATE ? `gate ${reject[k].toFixed(2)}` : tags.find((n) => DOCUMENT.test(n) || NOT_SOLO.test(n)) ?? tags20.find((n) => PET.test(n) && !NOT_PET.test(n));
    if (drop) { console.log(`[selfie] dropped (${drop}) ${p.uri}`); return []; }
    // CLIP and gate vectors live in different spaces: each is only compared with its own kind
    if (seen.some((v) => v.length === vec.length && (vecs ? dot(v, 0, vec, 0) > SAME_SHOT : cos(v, vec) > GATE_SAME_SHOT))) return [];
    if (vec.length) seen.push(vec);
    const aspect = scans[k].aspect, px = aspect >= 1 ? Math.min(p.width, p.height) : Math.max(p.width, p.height);
    const q = !vecs ? gateSharp(lap?.[k] ?? 0) : sharp && blurry ? dot(vec, 0, sharp, 0) - dot(vec, 0, blurry, 0) : 0;
    // ponytail: sharpness weight eyeballed from A54 logs (q spans about ±0.03); a pixel blur measure if it misranks
    const fit = profileFit(faces[0], aspect, px) * Math.min(1.2, Math.max(0.8, 1 + 6 * q)) * (tags.some((n) => POOR_AVATAR.test(n)) ? 0.5 : 1);
    return [{ p, face, fit, sharp: q, box: faces[0], aspect, vec, tags }];
  });
}

/**
 * Best first: the person in the most of these selfies (the phone's owner takes the most; SFace groups them), then by
 * fit (a well-framed, sharp face beats a bigger one). person -1: no face vector (facepack not there yet).
 * ponytail: selfies scanned before facepack landed stay ungrouped; rescan them with embed if the owner pick suffers.
 */
export function rankSelfies(pool: Selfie[]) {
  const has = pool.filter((s) => s.box.vec);
  const group = groupFaces(has.map((s) => faceVec(s.box)!));
  const person = new Map(has.map((s, i) => [s, group[i]]));
  const count = new Map<number, number>();
  group.forEach((g) => count.set(g, (count.get(g) ?? 0) + 1));
  return pool.map((s) => { const g = person.get(s) ?? -1; return { ...s, person: g, seen: count.get(g) ?? 0 }; })
    .sort((a, b) => b.seen - a.seen || a.person - b.person || b.fit - a.fit);
}
