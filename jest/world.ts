// The fake phone behind the native mocks (jest/setup.ts): a photo library with GPS + CLIP concepts, the background
// indexer's state, and what the share sheet / "Open with" hands the app. Tests build one with seedWorld().
import { floatsToB64, b64ToFloats, DIM } from '../src/services/index/vectors';
import type { TidyStats } from '../modules/clip-embedder';

export type FakePhoto = { id: string; uri: string; created: number; w: number; h: number; lat?: number; lon?: number; concepts: number[];
  /** file size in bytes (Tidy's listing; default 2 MB), IS_FAVORITE */
  size?: number; fav?: boolean;
  /** id of another photo whose own axis this one shares: the same shot (cosine ~1) */
  twin?: string;
};

/** Concept c lives on axis C0 + c; every photo also gets its own axis (so no two photos are near-duplicates), a twin its twin's. */
const C0 = 10, N_CONCEPTS = 90, U0 = 200;
const FILLER = Array.from({ length: 10 }, (_, i) => N_CONCEPTS + i);

export const NAMES: string[] = Array.from({ length: 100 }, (_, i) => `filler ${i}`);
Object.assign(NAMES, { 0: 'street', 7: 'cinnamon roll', 8: 'golden retriever puppy splashing through the shallow waves', 9: 'sunset' });

export const ISTANBUL = { lat: 41.01, lon: 28.97 };
export const SEATTLE = { lat: 47.6, lon: -122.33 };

export const world = {
  photos: [] as FakePhoto[],
  bg: { state: 'idle' as 'running' | 'slow' | 'paused' | 'lowbattery' | 'done' | 'idle', total: 0, left: 0, batteryPct: null as number | null, msPerPhoto: null as number | null },
  initialShare: null as { action: string; uris: string[]; mimeType: string } | null,
  shareListener: null as ((e: { action: string; uris: string[]; mimeType: string }) => void) | null,
  /** what the native share call resolves with: the package that got it */
  shareResult: 'com.instagram.android',
  /** the Post apps installed (shareTargets) */
  shareTargets: ['instagram', 'instagram-story', 'instagram-reel', 'tiktok'] as string[],
  /** expo-file-system copy/move are async on the phone: a file is in `written` once its promise resolves; while `held` is set, they wait there */
  files: { written: new Set<string>(), held: null as (() => void)[] | null },
  /** search languages (QueryTranslate): the phone's language, downloaded models, a gate translation downloads wait on, and
   *  whether the translate feature module (ML Kit's code, on demand from Play) is installed: download installs it */
  lang: { device: 'en' as string | null, downloaded: ['en'], gate: Promise.resolve(), dict: { 'gün batımı': 'sunset' } as Record<string, string>, module: true },
  /**
   * Tidy (Tidy.kt): pixel checks and 64 KB hashes per id (defaults: a sharp normal photo, `h<id>`), Trash state per id,
   * whether Android's Trash/Restore dialog is allowed, and the photos in Trash (out of `photos` until restored).
   */
  tidy: newTidy(),
};

function newTidy() {
  return { stats: {} as Record<string, TidyStats | null>, hash: {} as Record<string, string | null>, trash: {} as Record<string, { trashed: boolean; expires: number }>, allow: true, binned: [] as FakePhoto[] };
}

let n = 0;
export function photo(created: Date, concepts: number[], at?: { lat: number; lon: number }, camera = true): FakePhoto {
  const id = String(++n);
  return {
    id, uri: camera ? `file:///storage/emulated/0/DCIM/Camera/IMG_${id}.jpg` : `file:///storage/emulated/0/Pictures/IMG_${id}.jpg`,
    created: created.getTime(), w: 3000, h: 4000, lat: at?.lat, lon: at?.lon, concepts,
  };
}

/** n takes of one shot, 2 s apart: the rest are twins of the first. */
export function burst(created: Date, n: number, concepts: number[]): FakePhoto[] {
  const first = photo(created, concepts);
  return [first, ...Array.from({ length: n - 1 }, (_, i) => ({ ...photo(new Date(created.getTime() + 2000 * (i + 1)), concepts), twin: first.id }))];
}

/**
 * The default library (2025): 20 days at home in Istanbul, a week in Seattle (Aug 4-10, 3 a day), weekly cinnamon rolls
 * (May-Jun) and weekly golden-retriever photos in autumn: one trip and two topic stories.
 */
export function defaultLibrary(): FakePhoto[] {
  const out: FakePhoto[] = [];
  for (let d = 0; d < 20; d++) for (const h of [10, 15]) out.push(photo(new Date(2025, 2, 1 + d, h), [0], ISTANBUL));
  for (let d = 0; d < 7; d++) for (const h of [9, 13, 18]) out.push(photo(new Date(2025, 7, 4 + d, h), [0], SEATTLE));
  for (let w = 0; w < 8; w++) out.push(photo(new Date(2025, 4, 1 + 7 * w, 9), [7], ISTANBUL));
  for (let w = 0; w < 8; w++) out.push(photo(new Date(2025, 8, 22 + 5 * w, 17), [8], ISTANBUL));
  return out;
}

export function seedWorld(photos = defaultLibrary()) {
  world.photos = photos;
  world.bg = { state: 'idle', total: 0, left: 0, batteryPct: null, msPerPhoto: null };
  world.initialShare = null;
  world.shareResult = 'com.instagram.android';
  world.shareTargets = ['instagram', 'instagram-story', 'instagram-reel', 'tiktok'];
  world.files = { written: new Set(), held: null };
  world.tidy = newTidy();
}

export const byUri = (uri: string) => world.photos.find((p) => p.uri === uri);
export const byId = (id: string) => world.photos.find((p) => p.id === id);

function normalize(v: Float32Array) {
  const s = Math.hypot(...v);
  if (s) for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

export function photoVec(p: FakePhoto): Float32Array {
  const v = new Float32Array(DIM);
  v[0] = v[1] = v[2] = 0.1; // real CLIP rows are never zero up front (vectors.isZero)
  for (const c of p.concepts) v[C0 + c] = 1;
  v[U0 + (+(p.twin ?? p.id) % (DIM - U0))] = 1;
  return normalize(v);
}

export function textVec(text: string): Float32Array {
  const v = new Float32Array(DIM);
  const t = text.toLowerCase();
  const c = NAMES.findIndex((name, i) => i < N_CONCEPTS && !name.startsWith('filler') && t.includes(name));
  if (c >= 0) v[C0 + c] = 1;
  else v[U0 + ([...t].reduce((a, ch) => a + ch.charCodeAt(0), 0) % (DIM - U0))] = 1;
  return normalize(v);
}

export function embed(vs: Float32Array[]): string {
  const all = new Float32Array(vs.length * DIM);
  vs.forEach((v, i) => all.set(v, i * DIM));
  return floatsToB64(all);
}

/** Top k concepts per row: the real ones by score, padded with filler concepts every photo has (too generic for a topic). */
export function topConcepts(b64: string, k: number): { ids: number[]; scores: number[] } {
  const all = b64ToFloats(b64);
  const ids: number[] = [], scores: number[] = [];
  for (let r = 0; r < all.length / DIM; r++) {
    const row = all.subarray(r * DIM, (r + 1) * DIM);
    const real = Array.from({ length: N_CONCEPTS }, (_, c) => c).filter((c) => row[C0 + c] > 0).sort((a, b) => row[C0 + b] - row[C0 + a]);
    const top = [...real, ...FILLER].slice(0, k);
    ids.push(...top);
    scores.push(...top.map((c) => (c < N_CONCEPTS ? row[C0 + c] : 0.01)));
  }
  return { ids, scores };
}

/** Background results row for a photo, as BackgroundIndex.kt stores it. */
export function bgRow(p: FakePhoto, model: string) {
  const b64 = embed([photoVec(p)]);
  const c = topConcepts(b64, 10);
  return { model, row: { id: p.id, emb: b64, concepts: JSON.stringify([c.ids, c.scores]), lat: p.lat ?? null, lon: p.lon ?? null } };
}
