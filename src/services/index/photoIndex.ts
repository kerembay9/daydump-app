import * as MediaLibrary from 'expo-media-library/legacy';
import * as SQLite from 'expo-sqlite';
import { ClipEmbedder } from '../../../modules/clip-embedder';
import { PhotoAsset } from '../../types';
import { EVAL_ALBUM, GalleryService } from '../galleryService';
import { b64ToFloats, DIM, floatsToB64 } from './vectors';

const BATCH = 32; // 51 ms/photo vs 61 at 16 (GPU + CPU, MODEL_BENCHMARKS.md); 64 gains 2 ms for 2× the input memory
/** Which TinyCLIP the bundled ONNX is (written by scripts/build_assets.py). */
const MODEL = (require('./clipGolden.json') as { model: string }).model;
const TOP_CONCEPTS = 10;

export type IndexedPhoto = PhotoAsset & {
  /** top vocab concept ids (best first) and their cosine scores; empty without CLIP */
  concepts: number[];
  conceptScores: number[];
};

/** Everything the story engine needs. vecs is row-major n*512 aligned with photos; zero row = no embedding. */
export type Library = { photos: IndexedPhoto[]; vecs: Float32Array; conceptNames: string[]; hasClip: boolean };

type Row = { id: string; uri: string; created: number; w: number; h: number; lat: number | null; lon: number | null; emb: Uint8Array | null; concepts: string | null };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function db() {
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
 * Returns how many photos changed (newly indexed or retagged), so callers know to rebuild stories.
 * ponytail: foreground only, runs on app open; WorkManager backfill when big libraries make first open slow.
 */
export function indexLibrary(onProgress?: (done: number, total: number) => void): Promise<number> {
  return (running ??= run(onProgress).finally(() => (running = null)));
}

async function run(onProgress?: (done: number, total: number) => void): Promise<number> {
  const d = await db();
  const assets = await GalleryService.listLibraryPhotos();
  const rows = await d.getAllAsync<{ id: string; hasEmb: number }>('SELECT id, emb IS NOT NULL AS hasEmb FROM photos');
  const have = new Map(rows.map((r) => [r.id, !!r.hasEmb]));
  const live = new Set(assets.map((a) => a.id));
  const gone = rows.filter((r) => !live.has(r.id)).map((r) => r.id);
  for (let i = 0; i < gone.length; i += 500) {
    const ids = gone.slice(i, i + 500);
    await d.runAsync(`DELETE FROM photos WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  }

  const retagged = await retagIfVocabChanged(d);

  const todo = assets.filter((a) => !have.has(a.id) || (ClipEmbedder && !have.get(a.id)));
  const t0 = Date.now();
  const infosOf = (b: typeof todo) => Promise.all(b.map((a) => MediaLibrary.getAssetInfoAsync(a.id).catch(() => null)));
  let nextInfos = infosOf(todo.slice(0, BATCH));
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const infos = await nextInfos;
    nextInfos = infosOf(todo.slice(i + BATCH, i + 2 * BATCH)); // GPS + local uri of the next batch while this one embeds
    let vecs: Float32Array | null = null;
    let concepts: { ids: number[]; scores: number[] } | null = null;
    if (ClipEmbedder) {
      const b64 = await ClipEmbedder.embedImages(batch.map((a, j) => infos[j]?.localUri ?? a.uri));
      vecs = b64ToFloats(b64);
      concepts = await ClipEmbedder.topConcepts(b64, TOP_CONCEPTS);
    }
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
    onProgress?.(Math.min(i + BATCH, todo.length), todo.length);
  }
  if (todo.length) console.log(`[photoIndex] indexed ${todo.length} photos in ${Date.now() - t0} ms (${((Date.now() - t0) / todo.length).toFixed(0)} ms/photo)`);
  return todo.length + retagged;
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
