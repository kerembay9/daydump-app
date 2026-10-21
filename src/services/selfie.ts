import { Platform } from 'react-native';
import { embedText, IndexedPhoto, Library } from './index/photoIndex';
import { b64ToFloats, dot } from './index/vectors';
import type { PhotoAsset } from '../types';
import { searchRanked } from './stories';
import { isCameraPhoto } from './galleryService';
import { ClipEmbedder, type Face } from '../../modules/clip-embedder';
import { centered, faceVec, groupFaces, isAnyOf } from './faces';

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

/** A solo selfie scanSelfies found. vec: its CLIP vector (near-copy check); tags: its top 5 concepts (logs). */
export type Selfie = { p: PhotoAsset; face: number; box: Face; aspect: number; vec: Float32Array; tags: string[] };
let names: Promise<string[]> | undefined;

/**
 * Solo selfies among these photos without waiting for the photo index (CLIP reads ~55 ms/photo; the owner's selfies can be
 * 900 photos back). YuNet on MediaStore's cached thumbnails finds the photos with one big face; only those are decoded at
 * full size: YuNet again (sharper box; SFace with embed) and CLIP, to drop documents and other people (top 5 concepts), pets (top 20)
 * and near-copies of one in `seen` (kept ones are added to it). Needs the vision pack. Android only: [] elsewhere.
 */
export async function scanSelfies(photos: PhotoAsset[], embed: boolean, seen: Float32Array[]): Promise<Selfie[]> {
  if (!ClipEmbedder || Platform.OS !== 'android' || !photos.length) return [];
  const thumbs = await ClipEmbedder.faces(photos.map((p) => `content://media/external/images/media/${p.id}`), OTHER_FACE, false, 320);
  const solo = photos.filter((_, k) => selfieFace(thumbs[k]?.faces ?? []) > 0);
  if (!solo.length) return [];
  const uris = solo.map((p) => p.uri);
  const [scans, b64, cn] = await Promise.all([ClipEmbedder.faces(uris, OTHER_FACE, embed), ClipEmbedder.embedImages(uris, 0, true), (names ??= ClipEmbedder.conceptNames())]);
  const top = await ClipEmbedder.topConcepts(b64, 20);
  const vecs = b64ToFloats(b64);
  return solo.flatMap((p, k) => {
    const faces = scans[k]?.faces ?? [], face = selfieFace(faces);
    const tags20 = top.ids.slice(k * 20, k * 20 + 20).map((id) => cn[id]), tags = tags20.slice(0, 5);
    const vec = vecs.slice(k * 512, (k + 1) * 512);
    const drop = !face ? 'no solo face' : tags.find((n) => DOCUMENT.test(n) || NOT_SOLO.test(n)) ?? tags20.find((n) => PET.test(n) && !NOT_PET.test(n));
    if (drop) { console.log(`[selfie] dropped (${drop}) ${p.uri}`); return []; }
    if (seen.some((v) => dot(v, 0, vec, 0) > SAME_SHOT)) return [];
    seen.push(vec);
    return [{ p, face, box: faces[0], aspect: scans[k].aspect, vec, tags }];
  });
}

/**
 * Best first: the person in the most of these selfies (the phone's owner takes the most; SFace groups them), then by
 * selfieFace. person -1: no face vector (facepack not there yet).
 * ponytail: selfies scanned before facepack landed stay ungrouped; rescan them with embed if the owner pick suffers.
 */
export function rankSelfies(pool: Selfie[]) {
  const has = pool.filter((s) => s.box.vec);
  const group = groupFaces(has.map((s) => faceVec(s.box)!));
  const person = new Map(has.map((s, i) => [s, group[i]]));
  const count = new Map<number, number>();
  group.forEach((g) => count.set(g, (count.get(g) ?? 0) + 1));
  return pool.map((s) => { const g = person.get(s) ?? -1; return { ...s, person: g, seen: count.get(g) ?? 0 }; })
    .sort((a, b) => b.seen - a.seen || a.person - b.person || b.face - a.face);
}
