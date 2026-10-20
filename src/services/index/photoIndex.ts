import * as MediaLibrary from 'expo-media-library/legacy';
import { AppState } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { ClipEmbedder } from '../../../modules/clip-embedder';
import { PhotoAsset } from '../../types';
import { EVAL_ALBUM, GalleryService } from '../galleryService';
import { b64ToFloats, DIM, floatsToB64 } from './vectors';

const BATCH = 128; // 52 ms/photo vs 62 at 32 and 67 at 16 (GPU + CPU, MODEL_BENCHMARKS.md); input buffer 128 × 600 KB = 77 MB
/** Which TinyCLIP the bundled ONNX is (written by scripts/build_assets.py). */
const MODEL = (require('./clipGolden.json') as { model: string }).model;
const TOP_CONCEPTS = 10;
/** ~2 min of indexing in the app: worth the notification that lets it keep going once the user leaves (BackgroundIndex.kt fast mode). */
const FAST_MIN = 2500;

export type IndexedPhoto = PhotoAsset & {
  /** top vocab concept ids (best first) and their cosine scores; empty without CLIP */
  concepts: number[];
  conceptScores: number[];
};

/** Everything the story engine needs. vecs is row-major n*512 aligned with photos; zero row = no embedding. */
export type Library = { photos: IndexedPhoto[]; vecs: Float32Array; conceptNames: string[]; hasClip: boolean };

type Row = { id: string; uri: string; created: number; w: number; h: number; lat: number | null; lon: number | null; emb: Uint8Array | null; concepts: string | null };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
/** Also holds the dumps table (services/dumps.ts); resetIndex only clears photos, so dumps survive a reindex. */
export function db() {
  // Separate DB in eval mode so the validation index never mixes with the real library.
  return (dbPromise ??= SQLite.openDatabaseAsync(EVAL_ALBUM ? 'photo-index-eval.db' : 'photo-index.db').then(async (d) => {
    await d.execAsync(`CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY, uri TEXT NOT NULL, created INTEGER NOT NULL, w INTEGER, h INTEGER,
      lat REAL, lon REAL, emb BLOB, concepts TEXT);
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
    // Another model's vectors live in a different space: drop them so run() re-embeds every photo.
    if ((await d.getFirstAsync<{ v: string }>("SELECT v FROM meta WHERE k = 'model'"))?.v !== MODEL) {
      await d.execAsync('UPDATE photos SET emb = NULL, concepts = NULL; PRAGMA user_version = 0');
      await d.runAsync("INSERT OR REPLACE INTO meta (k, v) VALUES ('model', ?)", [MODEL]);
    }
    return d;
  }));
}

let running: Promise<number> | null = null;

/**
 * Incremental: indexes photos not yet in the DB (plus un-embedded rows once CLIP is available), drops deleted ones.
 * Returns how many photos changed (newly indexed, retagged or deleted), so callers know to rebuild stories.
 * Android, FAST_MIN+ photos: a native foreground service indexes them (notification with progress, keeps going after the
 * user leaves, pausable) while this follows along. Smaller todos run here; leaving hands the rest to a charging-only job.
 */
/**
 * onProgress's last = the photo just indexed: order is camera newest-first, then the rest newest-first.
 * bg: set while the native fast mode runs (batteryPct null = charging).
 */
export type IndexProgressFn = (done: number, total: number, last: PhotoAsset, bg?: { batteryPct: number | null; etaSec: number | null }) => void;

let handedOff = false;
/** True once a run left work to the background worker: call indexLibrary() again on return to pick it up. */
export const wasHandedOff = () => handedOff;

export function indexLibrary(onProgress?: IndexProgressFn): Promise<number> {
  return (running ??= run(onProgress).finally(() => (running = null)));
}

async function run(onProgress?: IndexProgressFn): Promise<number> {
  const d = await db();
  handedOff = false;
  const bg = await ClipEmbedder?.backgroundIndexStatus();
  // A fast or paused run is the user's to stop; a charging-only job just yields to the app.
  if (bg && bg.state !== 'running' && bg.state !== 'paused') await ClipEmbedder!.cancelBackgroundIndex();
  const tl = Date.now();
  const assets = await GalleryService.listLibraryPhotos();
  console.log(`[photoIndex] listed ${assets.length} photos in ${Date.now() - tl} ms`);
  const byId = new Map(assets.map((a, i) => [a.id, [a, i] as const]));
  const merged = (await mergeBackgroundResults(d, byId)).n;
  const rows = await d.getAllAsync<{ id: string; hasEmb: number }>('SELECT id, emb IS NOT NULL AS hasEmb FROM photos');
  const have = new Map(rows.map((r) => [r.id, !!r.hasEmb]));
  const live = new Set(assets.map((a) => a.id));
  const gone = rows.filter((r) => !live.has(r.id)).map((r) => r.id);
  for (let i = 0; i < gone.length; i += 500) {
    const ids = gone.slice(i, i + 500);
    await d.runAsync(`DELETE FROM photos WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  }

  // Rows indexed before the listing fell back to modification time (WhatsApp images) have created = 0: date them.
  const undated = (await d.getAllAsync<{ id: string }>('SELECT id FROM photos WHERE created = 0'))
    .map((r) => [r.id, byId.get(r.id)?.[0].creationTime] as const).filter(([, t]) => t);
  if (undated.length) await d.withTransactionAsync(async () => {
    for (const [id, t] of undated) await d.runAsync('UPDATE photos SET created = ? WHERE id = ?', [t!, id]);
  });
  // deleted photos count as a change too: their stories must go
  const retagged = (await retagIfVocabChanged(d)) + undated.length + gone.length;
  if (bg?.state === 'running') return merged + retagged + (await follow(d, byId, onProgress));
  if (bg?.state === 'paused') { // waits for Resume or the next charge
    handedOff = true;
    return merged + retagged;
  }

  const todo = assets.filter((a) => !have.has(a.id) || (ClipEmbedder && !have.get(a.id)));
  if (ClipEmbedder && bg?.canFast && todo.length >= FAST_MIN) {
    await ClipEmbedder.scheduleBackgroundIndex(todo.map((a) => a.id), todo.map((a) => a.uri), MODEL, true);
    return merged + retagged + (await follow(d, byId, onProgress));
  }
  const t0 = Date.now();
  const infosOf = (b: typeof todo) => Promise.all(b.map((a) => MediaLibrary.getAssetInfoAsync(a.id).catch(() => null)));
  let nextInfos = infosOf(todo.slice(0, BATCH));
  let i = 0;
  for (; i < todo.length; i += BATCH) {
    if (ClipEmbedder && AppState.currentState !== 'active') {
      const rest = todo.slice(i);
      await ClipEmbedder.scheduleBackgroundIndex(rest.map((a) => a.id), rest.map((a) => a.uri), MODEL, false);
      handedOff = true;
      console.log(`[photoIndex] app left the foreground: ${rest.length} photos handed to the background worker`);
      break;
    }
    const batch = todo.slice(i, i + BATCH);
    const tb = Date.now();
    const infos = await nextInfos;
    const infoWait = Date.now() - tb;
    nextInfos = infosOf(todo.slice(i + BATCH, i + 2 * BATCH)); // GPS + local uri of the next batch while this one embeds
    let vecs: Float32Array | null = null;
    let concepts: { ids: number[]; scores: number[] } | null = null;
    const te = Date.now();
    if (ClipEmbedder) {
      const b64 = await ClipEmbedder.embedImages(batch.map((a, j) => infos[j]?.localUri ?? a.uri));
      vecs = b64ToFloats(b64);
      concepts = await ClipEmbedder.topConcepts(b64, TOP_CONCEPTS);
    }
    const tw = Date.now();
    await d.withTransactionAsync(async () => {
      for (let j = 0; j < batch.length; j++) {
        const a = batch[j];
        const loc = infos[j]?.location;
        const emb = vecs ? new Uint8Array(vecs.buffer.slice(j * DIM * 4, (j + 1) * DIM * 4)) : null;
        const c = concepts
          ? JSON.stringify([concepts.ids.slice(j * TOP_CONCEPTS, (j + 1) * TOP_CONCEPTS), concepts.scores.slice(j * TOP_CONCEPTS, (j + 1) * TOP_CONCEPTS).map((s) => +s.toFixed(4))])
          : null;
        await d.runAsync('INSERT OR REPLACE INTO photos (id, uri, created, w, h, lat, lon, emb, concepts) VALUES (?,?,?,?,?,?,?,?,?)', [
          a.id, a.uri, a.creationTime, a.width, a.height, loc?.latitude ?? null, loc?.longitude ?? null, emb, c,
        ]);
      }
    });
    onProgress?.(Math.min(i + BATCH, todo.length), todo.length, batch[batch.length - 1]);
    const per = (ms: number) => (ms / batch.length).toFixed(0);
    console.log(`[photoIndex] ${Math.min(i + BATCH, todo.length)}/${todo.length}: ${per(Date.now() - tb)} ms/photo = info wait ${per(infoWait)} + embed+concepts ${per(tw - te)} + db ${per(Date.now() - tw)}`);
  }
  if (i) console.log(`[photoIndex] indexed ${Math.min(i, todo.length)} photos in ${Date.now() - t0} ms (${((Date.now() - t0) / Math.min(i, todo.length)).toFixed(0)} ms/photo)`);
  return merged + Math.min(i, todo.length) + retagged;
}

type ById = Map<string, readonly [PhotoAsset, number]>;

/**
 * Follows a fast run until it ends (done, paused, or stopped): merges results as they land, so stories grow while it
 * runs, and reports progress. JS timers sleep while the app is in the background; the loop catches up on return.
 */
async function follow(d: SQLite.SQLiteDatabase, byId: ById, onProgress?: IndexProgressFn): Promise<number> {
  let n = 0;
  let last: PhotoAsset | null = null;
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await ClipEmbedder!.backgroundIndexStatus(); // before merging, so the final rows land after 'done'
    const m = await mergeBackgroundResults(d, byId);
    n += m.n;
    last = m.last ?? last;
    if (last) onProgress?.(s.total - s.left, s.total, last, { batteryPct: s.batteryPct, etaSec: s.msPerPhoto == null ? null : (s.left * s.msPerPhoto) / 1000 });
    if (s.state !== 'running') {
      handedOff = s.state !== 'done';
      return n;
    }
  }
}

/** Moves what the background worker embedded into the index; asset metadata comes from the live listing. last = latest in index order. */
async function mergeBackgroundResults(d: SQLite.SQLiteDatabase, byId: ById): Promise<{ n: number; last: PhotoAsset | null }> {
  let n = 0;
  let last: readonly [PhotoAsset, number] | null = null;
  if (!ClipEmbedder) return { n, last: null };
  for (;;) {
    const { model, rows } = await ClipEmbedder.takeBackgroundResults(512);
    if (!rows.length) break;
    if (model !== MODEL) continue; // another model's vectors: drop, run() re-embeds them
    await d.withTransactionAsync(async () => {
      for (const r of rows) {
        const hit = byId.get(r.id);
        if (!hit) continue; // deleted since
        const a = hit[0];
        if (!last || hit[1] > last[1]) last = hit;
        await d.runAsync('INSERT OR REPLACE INTO photos (id, uri, created, w, h, lat, lon, emb, concepts) VALUES (?,?,?,?,?,?,?,?,?)', [
          a.id, a.uri, a.creationTime, a.width, a.height, r.lat, r.lon, new Uint8Array(b64ToFloats(r.emb).buffer), r.concepts,
        ]);
        n++;
      }
    });
  }
  if (n) console.log(`[photoIndex] merged ${n} photos from the background worker`);
  return { n, last: last?.[0] ?? null };
}

/** A fast run the user paused (notification or home page): it waits for resumeIndexing() or the next charge. */
export async function pausedIndex(): Promise<{ done: number; total: number } | null> {
  const s = await ClipEmbedder?.backgroundIndexStatus();
  return s?.state === 'paused' && s.left ? { done: s.total - s.left, total: s.total } : null;
}
export const pauseIndexing = async () => ClipEmbedder?.pauseBackgroundIndex();
/** Call while the app is on screen (Android only starts the foreground service then), then indexLibrary() to follow it. */
export const resumeIndexing = async () => ClipEmbedder?.resumeBackgroundIndex();

/** Debug: forget every vector so the next indexLibrary() re-embeds the whole library (sustained-speed bench). */
export async function clearEmbeddings() {
  await (await db()).execAsync('UPDATE photos SET emb = NULL, concepts = NULL');
}

/** Debug: drop every indexed photo, so the app looks like a first install to the indexer. */
export async function resetIndex() {
  await ClipEmbedder?.cancelBackgroundIndex(); // also clears a paused run
  await (await db()).execAsync('DELETE FROM photos');
}

let names: string[] | null = null;

/**
 * Stored concept ids point into the bundled vocab; a new vocab means re-scoring every stored embedding (no image decode).
 * ponytail: vocab size as its fingerprint (PRAGMA user_version); hash vocab.json if two vocabs ever share a size.
 */
async function retagIfVocabChanged(d: SQLite.SQLiteDatabase): Promise<number> {
  if (!ClipEmbedder) return 0;
  names ??= await ClipEmbedder.conceptNames();
  const v = (await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version;
  if (v === names.length) return 0;
  const rows = await d.getAllAsync<{ id: string; emb: Uint8Array }>('SELECT id, emb FROM photos WHERE emb IS NOT NULL');
  for (let i = 0; i < rows.length; i += 256) {
    const chunk = rows.slice(i, i + 256);
    const vecs = new Float32Array(chunk.length * DIM);
    chunk.forEach((r, j) => vecs.set(new Float32Array(r.emb.buffer.slice(r.emb.byteOffset, r.emb.byteOffset + DIM * 4)), j * DIM));
    const c = await ClipEmbedder.topConcepts(floatsToB64(vecs), TOP_CONCEPTS);
    await d.withTransactionAsync(async () => {
      for (let j = 0; j < chunk.length; j++) {
        const s = j * TOP_CONCEPTS, e = s + TOP_CONCEPTS;
        await d.runAsync('UPDATE photos SET concepts = ? WHERE id = ?', [JSON.stringify([c.ids.slice(s, e), c.scores.slice(s, e).map((x) => +x.toFixed(4))]), chunk[j].id]);
      }
    });
  }
  await d.execAsync(`PRAGMA user_version = ${names.length}`);
  console.log(`[photoIndex] retagged ${rows.length} photos for a ${names.length}-concept vocab`);
  return rows.length;
}

export async function loadLibrary(): Promise<Library> {
  const d = await db();
  const rows = await d.getAllAsync<Row>('SELECT * FROM photos ORDER BY created');
  const vecs = new Float32Array(rows.length * DIM);
  const photos = rows.map((r, i): IndexedPhoto => {
    if (r.emb) vecs.set(new Float32Array(r.emb.buffer.slice(r.emb.byteOffset, r.emb.byteOffset + DIM * 4)), i * DIM);
    const [ids, scores] = r.concepts ? (JSON.parse(r.concepts) as [number[], number[]]) : [[], []];
    return {
      id: r.id, uri: r.uri, creationTime: r.created, width: r.w, height: r.h, mediaType: 'photo',
      location: r.lat != null && r.lon != null ? { latitude: r.lat, longitude: r.lon } : undefined,
      concepts: ids, conceptScores: scores,
    };
  });
  if (ClipEmbedder && !names) names = await ClipEmbedder.conceptNames();
  return { photos, vecs, conceptNames: names ?? [], hasClip: !!ClipEmbedder };
}

/** One text query -> normalized 512-d vector, or null without CLIP. */
export async function embedText(text: string): Promise<Float32Array | null> {
  return ClipEmbedder ? b64ToFloats(await ClipEmbedder.embedTexts([text])) : null;
}

export async function conceptsForVector(v: Float32Array, k = 10): Promise<{ name: string; score: number }[]> {
  if (!ClipEmbedder) return [];
  const r = await ClipEmbedder.topConcepts(floatsToB64(v), k);
  names ??= await ClipEmbedder.conceptNames();
  return r.ids.map((id, i) => ({ name: names![id], score: r.scores[i] }));
}
