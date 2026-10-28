import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import { ClipEmbedder, TidyStats } from '../../../modules/clip-embedder';
import { list } from '../dumps';
import { getProfile } from '../profile';
import { db, embedText, mainDb } from '../index/photoIndex';
import { b64ToFloats, dot, DIM, isZero } from '../index/vectors';
import { buildResult, isStrict, Pile, softCandidate, TidyResult, TPhoto } from './rules';
import type { TidyFace } from '../../../modules/clip-embedder';

/**
 * Tidy's scan, outside any screen (hidden tabs are frozen): the whole library (Tidy.kt's cursor, unpruned), CLIP vectors
 * from the index plus its own for the photos the index skips, pixel checks, same-shot sets, exact copies, piles.
 * Every step's results go to tidy_photos as they come, so a killed scan picks up where it stopped.
 */
export type TidyState = {
  phase: 'idle' | 'list' | 'embed' | 'check' | 'group' | 'done' | 'error';
  done: number; total: number;
  /** creation time of the photo just checked (the progress line's month) */
  at: number | null;
  result: TidyResult | null;
  /** the last move to Trash, for the Done card (Undo, start a dump from the keepers) */
  moved: Moved | null;
  error?: string;
};
export type Moved = { session: number; n: number; bytes: number; keepers: TPhoto[]; from: number };

let state: TidyState = { phase: 'idle', done: 0, total: 0, at: null, result: null, moved: null };
const subs = new Set<() => void>();
const set = (p: Partial<TidyState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useTidy = () => useSyncExternalStore(subscribe, () => state);
export const tidyState = () => state;
export const clearMoved = () => set({ moved: null });

/** Trash is Android 11+ (MediaStore.createTrashRequest): there is no Tidy without it. */
export const tidySupported = () => Platform.OS === 'android' && Number(Platform.Version) >= 30 && !!ClipEmbedder?.tidyList;
/** "Select photos" access would leave Tidy counting part of the library. */
export async function hasFullAccess() {
  const p = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  return p.granted && (p as { accessPrivileges?: string }).accessPrivileges !== 'limited';
}

let running: Promise<void> | null = null;
export const startScan = () => (running ??= scan().catch((e) => { console.warn('[tidy] scan failed:', e); set({ phase: 'error', error: String(e) }); }).finally(() => { running = null; }));

const RENDERS = /\/Pictures\/(PicDump|DayDump)\//i;

let storyIds = new Set<string>();
/** Discover's current stories' slides: locked like dump photos (Discover sets them; Tidy reads them on its next build). */
export const setStoryPhotos = (ids: string[]) => { storyIds = new Set(ids); };
/** lockOf's map: photos in saved dumps and drafts, then Discover's stories. */
async function keepMap() {
  const m = new Map<string, string>([...storyIds].map((id) => [id, 'In a Discover story']));
  for (const dm of await list()) for (const p of dm.photos) m.set(p.id, 'In a dump');
  return m;
}

/**
 * The owner's SFace feature, from the profile photo (once per photo; meta table). Null without a profile photo with one
 * face, or while the faces pack hasn't landed (faces() rejects).
 */
export async function ownerFace(): Promise<Float32Array | null> {
  const avatar = (await getProfile()).avatar;
  if (!avatar) return null;
  const d = await db();
  const saved = await d.getFirstAsync<{ v: string }>("SELECT v FROM meta WHERE k = 'tidy_owner'");
  const was = saved ? JSON.parse(saved.v) as { avatar: string; vec: string } : null;
  let vec = was?.avatar === avatar ? was.vec : null;
  if (!vec) {
    const scan = await ClipEmbedder!.faces([avatar], 0.6, true).catch(() => null);
    vec = scan?.[0]?.faces[0]?.vec ?? null;
    if (!vec) return null;
    await d.runAsync("INSERT OR REPLACE INTO meta (k, v) VALUES ('tidy_owner', ?)", [JSON.stringify({ avatar, vec })]);
  }
  return b64ToFloats(vec);
}
/** SFace: same person when the dot is over 0.363 (OpenCV's cosine threshold). */
const isOwner = (owner: Float32Array | null, faces?: TidyFace[]) =>
  owner && faces?.length ? faces.some((f) => f.vec && b64ToFloats(f.vec).reduce((a, x, k) => a + x * owner[k], 0) > 0.363) : undefined;
/** Saved checks that predate the horizon check, or the face match (when there is a face to match against). */
const stale = (s: TPhoto['fs'], owner: Float32Array | null) => s === undefined || (!!s && (s.tilt === undefined || (!!owner && !!s.faces?.some((f) => f.vec === undefined))));
const SOFT_TAGS = ['sky', 'fog', 'night', 'darkness', 'a concert'];
type TRow = { id: string; stats: string | null; faces: string | null; sharp: number | null; emb: Uint8Array | null; concepts: string | null };
const vecOf = (emb: Uint8Array) => new Float32Array(emb.buffer.slice(emb.byteOffset, emb.byteOffset + DIM * 4));
const parse = <T,>(s: string | null | undefined): T | null => (s ? JSON.parse(s) as T : null);

async function scan() {
  const N = ClipEmbedder!;
  set({ phase: 'list', done: 0, total: 0 });
  const L = await N.tidyList!();
  const d = await db();
  const all = L.ids.map((id, i) => ({ id, path: L.paths[i], created: L.taken[i], w: L.w[i], h: L.h[i], size: L.size[i], fav: L.fav[i] }))
    .filter((p) => p.path && !RENDERS.test(p.path)).sort((a, b) => a.created - b.created);
  const idx = new Map((await d.getAllAsync<{ id: string; emb: Uint8Array; concepts: string | null }>('SELECT id, emb, concepts FROM photos WHERE emb IS NOT NULL')).map((r) => [r.id, r]));
  const own = new Map((await d.getAllAsync<TRow>('SELECT * FROM tidy_photos')).map((r) => [r.id, r]));
  const row = (id: string) => own.get(id) ?? (own.set(id, { id, stats: null, faces: null, sharp: null, emb: null, concepts: null }).get(id)!);
  const save = (col: 'stats' | 'faces' | 'sharp', ids: string[], vals: unknown[]) => d.withTransactionAsync(async () => {
    for (let j = 0; j < ids.length; j++) {
      const v = col === 'sharp' ? vals[j] as number : JSON.stringify(vals[j] ?? null);
      (row(ids[j]) as Record<string, unknown>)[col] = v;
      await d.runAsync(`INSERT INTO tidy_photos (id, ${col}) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET ${col} = excluded.${col}`, [ids[j], v]);
    }
  });
  const batched = async <T,>(todo: T[], n: number, phase: TidyState['phase'], f: (b: T[]) => Promise<void>, at: (x: T) => number) => {
    set({ phase, done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i += n) {
      const b = todo.slice(i, i + n);
      await f(b);
      set({ done: Math.min(i + n, todo.length), at: at(b[b.length - 1]) });
    }
  };

  // 1. CLIP vectors + tags for photos the index skipped (bursts, panoramas, long screenshots), as photoIndex.run() embeds
  const noVec = all.filter((p) => !idx.has(p.id) && !own.get(p.id)?.emb);
  await batched(noVec, 128, 'embed', async (b) => {
    const b64 = await N.embedImages(b.map((p) => `file://${p.path}`));
    const vecs = b64ToFloats(b64);
    const c = await N.topConcepts(b64, 10);
    await d.withTransactionAsync(async () => {
      for (let j = 0; j < b.length; j++) {
        const emb = new Uint8Array(vecs.buffer.slice(j * DIM * 4, (j + 1) * DIM * 4));
        const concepts = JSON.stringify([c.ids.slice(j * 10, j * 10 + 10), c.scores.slice(j * 10, j * 10 + 10).map((s) => +s.toFixed(4))]);
        Object.assign(row(b[j].id), { emb, concepts });
        await d.runAsync('INSERT INTO tidy_photos (id, emb, concepts) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET emb = excluded.emb, concepts = excluded.concepts', [b[j].id, emb, concepts]);
      }
    });
  }, (p) => p.created);

  // 2. pixel checks on every photo's 256 px thumbnail
  await batched(all.filter((p) => !own.get(p.id)?.stats), 64, 'check', async (b) => {
    await save('stats', b.map((p) => p.id), await N.tidyStats!(b.map((p) => p.id), 256, false));
  }, (p) => p.created);

  set({ phase: 'group', done: 0, total: 0 });
  const names = await N.conceptNames();
  const soft = new Set(SOFT_TAGS.map((s) => names.indexOf(s)).filter((i) => i >= 0));
  const [sharpT, blurT] = await Promise.all([embedText('a sharp, in-focus photo'), embedText('a blurry, out-of-focus photo')]);
  // Paper's and Chats' extra phrases need the text model (not fixed phrases yet): without it, the tags alone decide
  const phrase = (t: string) => embedText(t).catch(() => null);
  const [photoT, boardT, pageT, memeT] = await Promise.all(['a photo', 'a whiteboard', 'a printed page', 'a meme'].map(phrase));
  const owner = await ownerFace().catch((e) => { console.warn('[tidy] owner face failed:', e); return null; });
  const vecs = new Float32Array(all.length * DIM);
  const photos: TPhoto[] = all.map((a, i) => {
    const r = own.get(a.id);
    const emb = idx.get(a.id)?.emb ?? r?.emb;
    if (emb) vecs.set(vecOf(emb), i * DIM);
    const [concepts, conceptScores] = parse<[number[], number[]]>(idx.get(a.id)?.concepts ?? r?.concepts) ?? [[], []];
    const at = (t: Float32Array | null) => (emb && t ? dot(vecs, i, t, 0) : 0);
    const q = sharpT && blurT ? at(sharpT) - at(blurT) : 0;
    // ponytail: margins over "a photo" by eye; calibrate on ~50 labelled documents and memes
    const doc = !!emb && !!photoT && Math.max(at(boardT), at(pageT)) > at(photoT) + 0.01;
    const meme = !!emb && !!photoT && !!memeT && at(memeT) > at(photoT) + 0.02;
    const fs = r?.faces == null ? undefined : parse<TidyStats>(r.faces);
    return { id: a.id, uri: `file://${a.path}`, created: a.created, w: a.w, h: a.h, size: a.size, fav: a.fav, concepts, conceptScores, q,
      stats: parse<TidyStats>(r?.stats), fs, sharp: r?.sharp ?? undefined, set: -1, copy: '', vi: i, doc, meme, me: isOwner(owner, fs?.faces) };
  });

  // 3. same-shot sets (Tidy.kt), then faces + 512 px checks of their members, to pick each keeper
  const labels = await N.tidySets!(vecs, photos.map((p) => p.created), photos.map(isStrict));
  photos.forEach((p, i) => { p.set = labels[i]; });
  await batched(photos.filter((p) => p.set >= 0 && stale(p.fs, owner)), 32, 'check', async (b) => {
    const r = await N.tidyStats!(b.map((p) => p.id), 512, true);
    b.forEach((p, j) => { p.fs = r[j]; p.me = isOwner(owner, r[j]?.faces); });
    await save('faces', b.map((p) => p.id), r);
  }, (p) => p.created);

  // 4. blurry candidates: a sharper look at 720 px
  await batched(photos.filter((p) => p.set < 0 && p.sharp === undefined && softCandidate(p, soft)), 16, 'check', async (b) => {
    const r = await N.tidyStats!(b.map((p) => p.id), 720, false);
    b.forEach((p, j) => { p.sharp = r[j]?.lap ?? 1e9; });
    await save('sharp', b.map((p) => p.id), b.map((p) => p.sharp));
  }, (p) => p.created);

  // 5. exact copies: same size in pixels and bytes, and the same first 64 KB (a size match alone can be two photos)
  const bySize = new Map<string, TPhoto[]>();
  for (const p of photos) if (p.size > 0 && p.set < 0) { const k = `${p.w}x${p.h}x${p.size}`; bySize.set(k, [...(bySize.get(k) ?? []), p]); }
  const dupes = [...bySize.values()].filter((g) => g.length > 1).flat();
  const hashes = dupes.length ? await N.tidyHash!(dupes.map((p) => p.id)) : [];
  const byHash = new Map<string, number>();
  hashes.forEach((h) => { if (h) byHash.set(h, (byHash.get(h) ?? 0) + 1); });
  dupes.forEach((p, i) => { const h = hashes[i]; if (h && byHash.get(h)! > 1) p.copy = `${p.size}:${h}`; });

  const keep = await keepMap();
  const shotTag = names.indexOf('a screenshot');
  let res = buildResult(photos, vecs, keep, shotTag);

  // 6. you in a junk pile: faces (thumbnail) on Blurry and Chats photos, so a blurry selfie or a sent photo of you is locked
  if (owner) {
    const junk = [...res.piles.blurry, ...res.piles.chats].map((x) => x.p).filter((p) => stale(p.fs, owner));
    if (junk.length) {
      await batched(junk, 32, 'check', async (b) => {
        const r = await N.tidyStats!(b.map((p) => p.id), 256, true);
        b.forEach((p, j) => { p.fs = r[j]; p.me = isOwner(owner, r[j]?.faces); });
        await save('faces', b.map((p) => p.id), r);
      }, (p) => p.created);
      res = buildResult(photos, vecs, keep, shotTag);
    }
  }
  set({ phase: 'done', result: res });
  console.log(`[tidy] ${photos.length} photos (${photos.filter((p) => isZero(vecs, p.vi)).length} without a vector), ${res.sets.length} same-shot sets, owner ${owner ? 'known' : 'unknown'}, piles ${Object.entries(res.piles).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
}

async function log() {
  const m = await mainDb();
  await m.execAsync('CREATE TABLE IF NOT EXISTS trash_log (id TEXT NOT NULL, size INTEGER, at INTEGER, pile TEXT, session INTEGER, restored INTEGER DEFAULT 0)');
  return m;
}

/** Android asks once per request; ~45 bytes a uri, so 2000 stay well under the 1 MB binder limit. ponytail: measure the real cap on the A54. */
export const PER_DIALOG = 2000;

/**
 * Our sheet has confirmed: Android's own dialog(s) next, then a re-check of what really moved (each dialog is all or
 * nothing). Returns null when nothing moved. keepers: the set keepers kept, for "Start a dump from these keepers?".
 */
export async function moveToTrash(items: { p: TPhoto; pile: Pile }[], keepers: TPhoto[] = []): Promise<Moved | null> {
  const N = ClipEmbedder!;
  const live = await N.trashState!(items.map((x) => x.p.id));
  const todo = items.filter((x) => live[x.p.id] && !live[x.p.id].trashed);
  for (let i = 0; i < todo.length; i += PER_DIALOG) await N.trash!(todo.slice(i, i + PER_DIALOG).map((x) => x.p.id), true);
  const after = await N.trashState!(todo.map((x) => x.p.id));
  const moved = todo.filter((x) => after[x.p.id]?.trashed);
  if (!moved.length) return null;
  const session = Date.now();
  const m = await log();
  await m.withTransactionAsync(async () => {
    for (const x of moved) await m.runAsync('INSERT INTO trash_log (id, size, at, pile, session) VALUES (?, ?, ?, ?, ?)', [x.p.id, x.p.size, session, x.pile, session]);
  });
  const gone = new Set(moved.map((x) => x.p.id));
  const r = state.result!;
  const names = await N.conceptNames();
  const res = buildResult(r.photos.filter((p) => !gone.has(p.id)), r.vecs, await keepMap(), names.indexOf('a screenshot'));
  const done: Moved = { session, n: moved.length, bytes: moved.reduce((a, x) => a + x.p.size, 0), keepers, from: keepers.length + moved.filter((x) => x.pile === 'same').length };
  set({ result: res, moved: done });
  return done;
}

export type Session = { session: number; n: number; bytes: number; piles: string[]; inTrash: number; until: number | null;
  /** the session's photos still in Trash (MediaStore ids), for restoring one at a time */
  trashed: string[] };

/** Every move to Trash, newest first; inTrash = photos still restorable, until = when the first of them leaves Trash. */
export async function history(): Promise<Session[]> {
  const m = await log();
  const rows = await m.getAllAsync<{ id: string; size: number; pile: string; session: number }>('SELECT id, size, pile, session FROM trash_log WHERE restored = 0 ORDER BY session DESC');
  const st = rows.length ? await ClipEmbedder!.trashState!(rows.map((r) => r.id)) : {};
  const out = new Map<number, Session>();
  for (const r of rows) {
    const s = out.get(r.session) ?? { session: r.session, n: 0, bytes: 0, piles: [], inTrash: 0, until: null, trashed: [] };
    s.n++; s.bytes += r.size;
    if (!s.piles.includes(r.pile)) s.piles.push(r.pile);
    const t = st[r.id];
    if (t?.trashed) { s.inTrash++; s.trashed.push(r.id); s.until = Math.min(s.until ?? Infinity, t.expires); }
    out.set(r.session, s);
  }
  return [...out.values()];
}

/** Android's Restore dialog for a session's photos still in Trash (only = just these); they come back into Tidy with a rescan. */
export async function restore(session: number, only?: string[]): Promise<boolean> {
  const m = await log();
  const ids = only ?? (await m.getAllAsync<{ id: string }>('SELECT id FROM trash_log WHERE session = ? AND restored = 0', [session])).map((r) => r.id);
  const st = await ClipEmbedder!.trashState!(ids);
  const back = ids.filter((id) => st[id]?.trashed);
  if (!back.length || !(await ClipEmbedder!.trash!(back, false))) return false;
  await m.withTransactionAsync(async () => {
    for (const id of back) await m.runAsync('UPDATE trash_log SET restored = 1 WHERE session = ? AND id = ?', [session, id]);
  });
  if (state.moved?.session === session && !only) set({ moved: null });
  startScan();
  return true;
}

/** Tidy was started on this phone before: its tab scans again on open (cached checks make that quick). */
export async function scannedBefore() {
  return !!(await (await db()).getFirstAsync('SELECT 1 FROM tidy_photos LIMIT 1'));
}
