import * as MediaLibrary from 'expo-media-library/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';
import { db } from './index/photoIndex';
import type { Story } from './stories';
import { copyTitle, matches, photoRange } from './dumpLabels';
import { getProfile, profileNow } from './profile';
import { Directory, File, Paths } from 'expo-file-system';

/** id = MediaStore asset id; a photo with no asset (shared in by uri) uses its uri as id. created = taken at (ms). */
export type DumpPhoto = { id: string; uri: string; created?: number; /** added by a suggestion (✨) */ suggested?: boolean };
export type DumpStatus = 'draft' | 'posted';
/** story = opened from Discover, create = Create basket, share = photos shared / "opened with" DayDump */
export type DumpSource = 'story' | 'create' | 'share';

/** A saved dump: Library's Drafts and Posted, and what Edit / Preview open by id. */
export type Dump = {
  id: string;
  title: string;
  status: DumpStatus;
  source: DumpSource;
  /** the Discover story it came from (one draft per story) */
  storyId: string | null;
  photos: DumpPhoto[];
  ratio: string;
  fit: string | null;
  layout: string | null;
  filter: Record<string, unknown> | null;
  caption: string | null;
  /** 'instagram' | 'tiktok' once posted */
  platform: string | null;
  created: number;
  edited: number;
  postedAt: number | null;
};

const COLS = ['id', 'title', 'status', 'source', 'story_id', 'photos', 'ratio', 'fit', 'layout', 'filter', 'caption', 'platform', 'created', 'edited', 'posted_at'];
type Row = { id: string; title: string; status: DumpStatus; source: DumpSource; story_id: string | null; photos: string; ratio: string; fit: string | null; layout: string | null; filter: string | null; caption: string | null; platform: string | null; created: number; edited: number; posted_at: number | null };

// Lives in photo-index.db next to the photos table; resetIndex() only empties photos, so dumps survive a reindex.
// The partial unique index makes "one draft per story" a DB rule, so a double tap can't make two.
let ready: Promise<SQLiteDatabase> | null = null;
const dbx = () => (ready ??= db().then(async (d) => {
  await d.execAsync(`CREATE TABLE IF NOT EXISTS dumps (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL, story_id TEXT,
    photos TEXT NOT NULL, ratio TEXT NOT NULL, fit TEXT, layout TEXT, filter TEXT, caption TEXT, platform TEXT,
    created INTEGER NOT NULL, edited INTEGER NOT NULL, posted_at INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS dumps_story_draft ON dumps (story_id) WHERE status = 'draft' AND story_id IS NOT NULL`);
  return d;
}));

const fromRow = (r: Row): Dump => ({
  id: r.id, title: r.title, status: r.status, source: r.source, storyId: r.story_id, photos: JSON.parse(r.photos),
  ratio: r.ratio, fit: r.fit, layout: r.layout, filter: r.filter ? JSON.parse(r.filter) : null, caption: r.caption,
  platform: r.platform, created: r.created, edited: r.edited, postedAt: r.posted_at,
});
const toRow = (d: Dump) => [d.id, d.title, d.status, d.source, d.storyId, JSON.stringify(d.photos), d.ratio, d.fit, d.layout,
  d.filter ? JSON.stringify(d.filter) : null, d.caption, d.platform, d.created, d.edited, d.postedAt];

export { isDumpId } from './dumpLabels';

async function insert(d: Dump): Promise<Dump> {
  await (await dbx()).runAsync(`INSERT INTO dumps (${COLS.join(',')}) VALUES (${COLS.map(() => '?').join(',')})`, toRow(d));
  return d;
}

async function save(d: Dump): Promise<Dump> {
  await (await dbx()).runAsync(`UPDATE dumps SET ${COLS.slice(1).map((c) => `${c} = ?`).join(',')} WHERE id = ?`, [...toRow(d).slice(1), d.id]);
  return d;
}

/**
 * A new draft starts with the Profile defaults (post size, frame style) unless init sets them. With no title it is
 * named by its photos' date range ("May 12–18"), so untitled drafts still tell apart in Library. A title already
 * in Library gets a " (2)" suffix.
 */
export async function createDraft(init: Pick<Dump, 'source' | 'photos'> & Partial<Pick<Dump, 'title' | 'storyId' | 'ratio' | 'fit' | 'layout' | 'filter' | 'caption'>>): Promise<Dump> {
  const { ratio, fit } = await getProfile();
  const now = Date.now();
  const title = init.title ?? photoRange({ photos: init.photos, created: now }, now);
  const taken = (await list()).map((x) => x.title);
  return insert({
    storyId: null, ratio, fit, layout: null, filter: null, caption: null, ...init,
    title: taken.includes(title) ? copyTitle(title, taken) : title, // two "Cat" drafts → "Cat", "Cat (2)"
    id: `d_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    status: 'draft', platform: null, created: now, edited: now, postedAt: null,
  });
}

/**
 * Auto-save: merge the change and stamp edited. Null if the dump is gone. A posted dump is a record of what went out:
 * only a patch that sets status (markPosted, a re-post) writes to it; anything else (a stale Edit's autosave) is dropped.
 */
export async function update(id: string, patch: Partial<Omit<Dump, 'id' | 'created'>>): Promise<Dump | null> {
  const d = await getRaw(id);
  if (d?.status === 'posted' && patch.status === undefined) return d;
  return d ? save({ ...d, ...patch, edited: Date.now() }) : null;
}

/** Reuse: a posted dump copied into a new draft "{title} (2)"; the original stays as it was. */
export async function duplicate(id: string): Promise<Dump | null> {
  const d = await getRaw(id);
  if (!d) return null;
  const taken = (await list()).map((x) => x.title);
  const { title, source, photos, ratio, fit, layout, filter, caption } = d;
  return createDraft({ title: copyTitle(title, taken), source, photos, ratio, fit, layout, filter, caption });
}

/** The Post share opened (Android can't tell if it was really posted). platform null = the chooser (no IG/TikTok app). */
export const markPosted = (id: string, platform: string | null, caption?: string) =>
  update(id, { status: 'posted', platform, postedAt: Date.now(), ...(caption != null ? { caption } : {}) });

/** Newest first (posted by post date, drafts by last edit); query = Library search (every word must match). */
export async function list(status?: DumpStatus, query = ''): Promise<Dump[]> {
  const rows = await (await dbx()).getAllAsync<Row>(
    `SELECT * FROM dumps ${status ? 'WHERE status = ?' : ''} ORDER BY COALESCE(posted_at, edited) DESC`, status ? [status] : []);
  const now = Date.now();
  return rows.map(fromRow).filter((d) => matches(d, query, now));
}

async function getRaw(id: string): Promise<Dump | null> {
  const r = await (await dbx()).getFirstAsync<Row>('SELECT * FROM dumps WHERE id = ?', [id]);
  return r ? fromRow(r) : null;
}

/**
 * A dump to open: photos deleted from the phone since are dropped. The drop is saved only with full photo access:
 * under Android 14 "selected photos" access MediaStore hides unselected photos (null, same as deleted), and a dump
 * can't be rebuilt like the index, so with limited access nothing is dropped. All gone -> photos [] (not saved).
 */
export async function get(id: string): Promise<Dump | null> {
  const d = await getRaw(id);
  if (!d) return null;
  const perm = await MediaLibrary.getPermissionsAsync(false, ['photo']).catch(() => null);
  if (perm?.accessPrivileges !== 'all') return d;
  // Missing asset -> null; an error keeps the photo.
  const keep = await Promise.all(d.photos.map((p) =>
    p.id === p.uri ? true : MediaLibrary.getAssetInfoAsync(p.id).then((a) => a != null, () => true)));
  if (keep.every(Boolean)) return d;
  const photos = d.photos.filter((_, i) => keep[i]);
  return photos.length ? save({ ...d, photos }) : { ...d, photos };
}

export async function remove(id: string): Promise<void> {
  await (await dbx()).runAsync('DELETE FROM dumps WHERE id = ?', [id]);
}

/** A Discover story's draft, if it has been opened in Edit. */
export async function storyDraft(storyId: string): Promise<Dump | null> {
  const r = await (await dbx()).getFirstAsync<Row>("SELECT * FROM dumps WHERE story_id = ? AND status = 'draft'", [storyId]);
  return r ? get(r.id) : null;
}

/** An unsaved dump of a story's picks with the new-draft defaults (Preview of a story never opened in Edit). */
export const storyAsDump = (s: Story): Dump => ({
  id: s.id, title: s.title, status: 'draft', source: 'story', storyId: s.id,
  photos: s.picks.map((p) => ({ id: p.id, uri: p.uri, created: p.creationTime })),
  ratio: profileNow().ratio, fit: profileNow().fit, layout: null, filter: null, caption: null, platform: null, created: s.end, edited: s.end, postedAt: null,
});

/** Opening a Discover story in Edit: its draft, made from the story's picks the first time. */
export async function draftForStory(s: Story): Promise<Dump> {
  const found = await storyDraft(s.id);
  if (found) return found;
  // a concurrent open won the insert (unique index): use its draft
  return createDraft({ title: s.title, source: 'story', storyId: s.id, photos: storyAsDump(s).photos })
    .catch(async (e) => (await storyDraft(s.id)) ?? Promise.reject(e));
}

/** The draft the Create tab is working on (P6 sets it when the basket gets its first photo). */
export async function currentCreateDraft(): Promise<Dump | null> {
  const id = (await (await dbx()).getFirstAsync<{ v: string }>("SELECT v FROM meta WHERE k = 'create_draft'"))?.v;
  const d = id ? await get(id) : null;
  return d?.status === 'draft' ? d : null;
}

export async function setCurrentCreateDraft(id: string | null): Promise<void> {
  const d = await dbx();
  if (id) await d.runAsync("INSERT OR REPLACE INTO meta (k, v) VALUES ('create_draft', ?)", [id]);
  else await d.runAsync("DELETE FROM meta WHERE k = 'create_draft'");
}

/**
 * Photos shared / "opened with" DayDump -> dump photos. A MediaStore uri keeps its asset id, so Create's grid shows it
 * selected; anything else (a cloud gallery's own provider) is copied into the app, because the read grant ends with
 * the share. A copy that fails keeps the uri as is.
 */
export async function sharedPhotos(uris: string[]): Promise<DumpPhoto[]> {
  const out: DumpPhoto[] = [];
  for (const uri of uris) {
    const id = /^content:\/\/media\/[^/]+\/images\/media\/(\d+)/.exec(uri)?.[1];
    if (id) {
      const a = await MediaLibrary.getAssetInfoAsync(id).catch(() => null);
      out.push({ id, uri: a?.uri ?? uri, created: a?.creationTime });
      continue;
    }
    try {
      const dir = new Directory(Paths.document, 'shared');
      if (!dir.exists) dir.create();
      const dest = new File(dir, `${Date.now()}-${out.length}.jpg`);
      await new File(uri).copy(dest);
      out.push({ id: dest.uri, uri: dest.uri, created: Date.now() });
    } catch (e) {
      console.warn('[share] copy failed, keeping the uri:', e);
      out.push({ id: uri, uri });
    }
  }
  return out.filter((p, i) => out.findIndex((q) => q.id === p.id) === i);
}

/** The share-in sheet was dismissed: delete the copies sharedPhotos made (MediaStore photos are left alone). */
export function discardShared(photos: DumpPhoto[]) {
  const dir = new Directory(Paths.document, 'shared').uri;
  for (const p of photos) if (p.uri.startsWith(dir)) try { new File(p.uri).delete(); } catch (e) { console.warn('[share] cleanup failed:', e); }
}

/** Shared photos into Create: added to the current Create draft ('add'), or a new draft that becomes current. */
export async function receiveShared(photos: DumpPhoto[], mode: 'add' | 'new'): Promise<Dump> {
  const cur = mode === 'add' ? await currentCreateDraft() : null;
  if (cur) {
    const have = new Set(cur.photos.map((p) => p.id));
    const d = await update(cur.id, { photos: [...cur.photos, ...photos.filter((p) => !have.has(p.id))] });
    if (d) return d;
  }
  const d = await createDraft({ source: 'share', title: 'Shared photos', photos });
  await setCurrentCreateDraft(d.id);
  return d;
}
