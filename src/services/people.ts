import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { ClipEmbedder, type Face, type FaceScan } from '../../modules/clip-embedder';
import { whenReady } from '../state/models';
import { dot, faceVec, grouper, isAnyOf, meanOf } from './faces';
import { getProfile } from './profile';

/**
 * uri -> faces found; names: face key (uri#index) -> name, so a name survives regrouping; groups: face key -> person.
 * me: the profile's name was given to the person matching its avatar (once, so clearing it sticks).
 * tags: face key -> a merge the user made; groups sharing one are one person. apart: pairs of face keys the user said aren't the
 * same person. strays: faces the user said aren't their person; they're nobody now. All by face, so they survive regrouping.
 * grouping: the settings the groups were made with; when they change everything is regrouped.
 */
type Saved = {
  scans: Record<string, FaceScan>; names: Record<string, string>; groups?: Record<string, number>; me?: boolean; grouping?: string;
  tags?: Record<string, string>; apart?: [string, string][]; strays?: Record<string, boolean>;
};
type Shot = { key: string; uri: string; f: Face };
/** id: the group, which keeps its number as new photos are scanned. shots[0]: the person's picture, the biggest, surest of the half of their faces most like the rest; then biggest, surest first. vec: the mean of their faces. merged: more than one group, so it can be separated again. */
export type Person = { id: number; shots: Shot[]; uris: Set<string>; photos: number; name: string; vec: Float32Array; merged: boolean };
/** with: photos must have these people (all of them, or any if either); without: photos must not have these. */
export type PeopleFilter = { with: number[]; without: number[]; either: boolean };

export const NO_FILTER: PeopleFilter = { with: [], without: [], either: false };

// ponytail: the whole file is parsed at launch and rewritten at each checkpoint (~10 MB at 15k faces); SQLite if that shows
const file = () => new File(Paths.document, 'people-experiment.json'); // the experiment's name, so its scans and names carry over
const BATCH = 16;
const CHECKPOINT = 40; // batches (~1 min): group, save and show what's found so far
const MIN_FACE = 0.05; // face height as a share of the photo: smaller ones are too few pixels for SFace
const MIN_SCORE = 0.8; // detector confidence: under this it's mostly toys, pets, food, logos and backs of heads (A54, 4,110 photos); the two most-photographed people lost under 5%
const MIN_PHOTOS = 2; // one photo is a stranger
// Cosines against a group's mean, which run higher than OpenCV's 0.363 between two faces.
const JOIN = 0.5; // a face joins a group over this
const MERGE = 0.55; // two groups merge on their own over this, unless they share photos or the user said no (A54, 4,110 photos: the pairs under it start being different people at 0.51)
const SUGGEST = 0.44; // over this, ask the user: about half are the same person; under it nearly none are (same photos)
const SHARED = 0.05; // of the smaller group's photos. A photo's faces are different people, but one lookalike can split a person in two (A54: 121 and 267 photos sharing 4, cosine 0.84)
const GROUPING = `${MIN_SCORE} ${JOIN} ${MERGE} ${SHARED}`;

let saved: Saved = { scans: {}, names: {} };
let state = { list: [] as Person[], shown: [] as Person[], scanned: 0, suggest: null as [Person, Person] | null };
const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const save = () => { try { file().write(JSON.stringify(saved)); } catch (e) { console.warn('[people] save failed:', e); } };
const publish = () => {
  const list = people(saved, saved.groups ?? {});
  const shown = list.filter((p) => p.photos >= MIN_PHOTOS);
  state = { list, shown, scanned: Object.keys(saved.scans).length, suggest: suggestMerge(shown, saved.apart) };
  subs.forEach((f) => f());
};

/** The people found so far, most photos first. shown: the ones in enough photos to offer; list: everyone; suggest: the likeliest two to be one person. */
export const usePeople = () => useSyncExternalStore(subscribe, () => state);

const shotsOf = (s: Saved): Shot[] => Object.entries(s.scans).flatMap(([uri, sc]) =>
  sc.faces.flatMap((f, i) => (f.vec && f.h >= MIN_FACE && f.score >= MIN_SCORE && !s.strays?.[`${uri}#${i}`] ? [{ key: `${uri}#${i}`, uri, f }] : [])));

const same = (a: string, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

const vote = (sh: Shot[], from: Record<string, string> = {}) => {
  const votes = new Map<string, number>();
  sh.forEach((x) => { const v = from[x.key]; if (v) votes.set(v, (votes.get(v) ?? 0) + 1); });
  return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

/**
 * The saved groups as people, most photos first; a person's name is the one given to most of their faces, and groups with the
 * same name or tag are one person (how the user merges a person split in two).
 */
export function people(s: Saved, groups: Record<string, number>): Person[] {
  const by = new Map<number, Shot[]>();
  shotsOf(s).forEach((x) => { const g = groups[x.key]; if (g !== undefined) (by.get(g) ?? by.set(g, []).get(g)!).push(x); });
  type P = { id: number; name: string; sh: Shot[]; merged: boolean };
  const named = new Map<string, P>();
  const tagged = new Map<string, P>();
  const out: P[] = [];
  by.forEach((sh, id) => {
    const name = vote(sh, s.names);
    const tag = vote(sh, s.tags);
    let p = (name && named.get(name.toLowerCase())) || (tag && tagged.get(tag)) || null;
    if (p) { p.sh.push(...sh); p.name ||= name; p.merged = true; }
    else out.push((p = { id, name, sh, merged: false }));
    if (name) named.set(name.toLowerCase(), p);
    if (tag) tagged.set(tag, p);
  });
  return out
    .map(({ id, name, sh, merged }) => {
      const uris = new Set(sh.map((x) => x.uri));
      sh.sort((a, b) => b.f.w * b.f.h * b.f.score - a.f.w * a.f.h * a.f.score);
      const vs = sh.map((x) => faceVec(x.f)!);
      const vec = meanOf(vs);
      const like = vs.map((v) => dot(v, vec));
      const mid = [...like].sort((a, b) => a - b)[like.length >> 1];
      sh.unshift(...sh.splice(like.findIndex((v) => v >= mid), 1)); // the biggest can be a stray that joined the group
      return { id, shots: sh, uris, photos: uris.size, name, vec, merged };
    })
    .sort((a, b) => b.photos - a.photos);
}

const sharePhotos = (a: Set<string>, b: Set<string>) => [...a].filter((u) => b.has(u)).length > SHARED * Math.min(a.size, b.size);
const isApart = (apart: [string, string][], a: (key: string) => boolean, b: (key: string) => boolean) => apart.some(([x, y]) => (a(x) && b(y)) || (a(y) && b(x)));

/** The two people likeliest to be one, to ask the user: never two in the same photos, or two the user said aren't. */
export function suggestMerge(list: Person[], apart: [string, string][] = []): [Person, Person] | null {
  let best: [Person, Person] | null = null;
  let bestS = SUGGEST;
  const has = (p: Person) => (key: string) => p.shots.some((x) => x.key === key);
  list.forEach((p, i) => list.slice(i + 1).forEach((q) => {
    const s = dot(p.vec, q.vec);
    if (s > bestS && !sharePhotos(p.uris, q.uris) && !isApart(apart, has(p), has(q))) { best = [p, q]; bestS = s; }
  }));
  return best;
}

/** The photos this filter keeps. Photos not scanned yet have nobody in them. */
export function filterPhotos<T extends { uri: string }>(photos: T[], f: PeopleFilter, list: Person[]): T[] {
  const yes = list.filter((p) => f.with.includes(p.id));
  const no = list.filter((p) => f.without.includes(p.id));
  if (!yes.length && !no.length) return photos;
  return photos.filter((x) => !no.some((p) => p.uris.has(x.uri)) && (!yes.length || (f.either ? yes.some((p) => p.uris.has(x.uri)) : yes.every((p) => p.uris.has(x.uri)))));
}

/** The n people in the most of these photos, most first. */
export function peopleIn(photos: { uri: string }[], list: Person[], n = 3): Person[] {
  return list.map((p) => ({ p, in: photos.filter((x) => p.uris.has(x.uri)).length })).filter((x) => x.in)
    .sort((a, b) => b.in - a.in).slice(0, n).map((x) => x.p);
}

/** The filter in words ("with Ada & Ben without 1 person"); '' when it filters nothing. */
export function filterLabel(f: PeopleFilter, list: Person[]): string {
  const who = (ids: number[], join: string) => {
    const ps = list.filter((p) => ids.includes(p.id));
    return ps.every((p) => p.name) ? ps.map((p) => p.name).join(join) : `${ps.length} ${ps.length === 1 ? 'person' : 'people'}`;
  };
  const yes = list.some((p) => f.with.includes(p.id)) ? `with ${who(f.with, f.either ? ' or ' : ' & ')}` : '';
  const no = list.some((p) => f.without.includes(p.id)) ? `without ${who(f.without, ', ')}` : '';
  return [yes, no].filter(Boolean).join(' ');
}

/** Names p (''= no name). If someone else has that name it asks first, since the same name merges them; onNo: it said no. */
export function renamePerson(p: Person, name: string, onNo?: () => void) {
  if (name === p.name) return;
  const write = () => {
    p.shots.forEach((x) => (name ? (saved.names[x.key] = name) : delete saved.names[x.key]));
    save();
    publish();
  };
  const other = state.list.find((x) => x.id !== p.id && same(x.name, name));
  if (!other) return write();
  Alert.alert(`Merge with ${other.name}?`, `Someone is already called ${other.name}. Are they the same person?`, [
    { text: 'No', style: 'cancel', onPress: onNo },
    { text: 'Merge', onPress: write },
  ], { cancelable: true, onDismiss: onNo });
}

/** One person now: a keeps its name, or takes b's. Returns the undo. */
export function mergePeople(a: Person, b: Person) {
  const tags = (saved.tags ??= {});
  const tag = tags[a.shots[0].key] ?? tags[b.shots[0].key] ?? String(Date.now());
  const name = a.name || b.name;
  const key = a.shots[0].key;
  const shots = [...a.shots, ...b.shots];
  const names = shots.map((x) => saved.names[x.key]);
  shots.forEach((x) => { tags[x.key] = tag; if (name) saved.names[x.key] = name; });
  save();
  publish();
  return () => {
    const p = state.list.find((x) => x.shots.some((sh) => sh.key === key));
    if (!p) return;
    separatePerson(p);
    shots.forEach((x, i) => { if (names[i]) saved.names[x.key] = names[i]; else delete saved.names[x.key]; });
    save();
    publish();
  };
}

/** Undoes merges: back to one person per group, not to be merged or suggested again. The first group keeps the name. */
export function separatePerson(p: Person) {
  const groups = saved.groups ?? {};
  const key = p.shots[0].key;
  const asked = new Set([groups[key]]);
  p.shots.forEach((x) => {
    if (saved.tags) delete saved.tags[x.key];
    if (groups[x.key] === groups[key]) return;
    delete saved.names[x.key];
    if (!asked.has(groups[x.key])) { asked.add(groups[x.key]); (saved.apart ??= []).push([key, x.key]); }
  });
  save();
  publish();
}

/** "Not the same person": they stop being suggested, and won't merge on their own. */
export function keepApart(a: Person, b: Person) {
  (saved.apart ??= []).push([a.shots[0].key, b.shots[0].key]);
  save();
  publish();
}

/** "Not this person": the face is nobody now. */
export function removeFace(key: string) {
  (saved.strays ??= {})[key] = true;
  save();
  publish();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Lets the JS thread breathe, then waits out whatever has priority (a finger on the screen, indexing). */
const breathe = async (busy: () => boolean) => { await sleep(0); while (busy()) await sleep(500); };

const add = grouper(JOIN);
const grouped = new Set<string>();
/** Second pass: groups that turn out to be one person (a split the first pass can't heal) become one, biggest first. */
async function mergeClose(busy: () => boolean) {
  const groups = saved.groups!;
  const by = new Map<number, { keys: string[]; uris: Set<string> }>();
  shotsOf(saved).forEach((x) => {
    const g = by.get(groups[x.key]) ?? by.set(groups[x.key], { keys: [], uris: new Set() }).get(groups[x.key])!;
    g.keys.push(x.key);
    g.uris.add(x.uri);
  });
  const ids = [...by.keys()].sort((a, b) => by.get(b)!.keys.length - by.get(a)!.keys.length);
  let t = Date.now();
  for (let i = 0; i < ids.length; i++) {
    const a = by.get(ids[i]);
    if (!a) continue;
    for (let j = i + 1; j < ids.length; j++) {
      if (Date.now() - t > 8) { await breathe(busy); t = Date.now(); }
      const b = by.get(ids[j]);
      if (!b || dot(add.means[ids[i]], add.means[ids[j]]) <= MERGE || sharePhotos(a.uris, b.uris)) continue;
      if (isApart(saved.apart ?? [], (k) => groups[k] === ids[i], (k) => groups[k] === ids[j])) continue;
      add.merge(ids[i], ids[j]);
      b.keys.forEach((k) => { groups[k] = ids[i]; a.keys.push(k); });
      b.uris.forEach((u) => a.uris.add(u));
      by.delete(ids[j]);
    }
  }
}

/** New faces join the groups, a slice at a time (4 s for 1,784 faces at once on the A54, in JS); a photo's faces are different people. */
async function group(busy: () => boolean) {
  const groups = (saved.groups ??= {});
  const fresh = shotsOf(saved).filter((x) => !grouped.has(x.key));
  fresh.sort((a, b) => +(groups[a.key] === undefined) - +(groups[b.key] === undefined));
  let joined = false;
  let t = Date.now();
  for (const x of fresh) {
    if (Date.now() - t > 8) { await breathe(busy); t = Date.now(); }
    const known = groups[x.key];
    if (known === undefined) joined = true;
    groups[x.key] = add(faceVec(x.f)!, known, new Set(saved.scans[x.uri].faces.map((_, i) => groups[`${x.uri}#${i}`])));
    grouped.add(x.key);
  }
  if (joined) await mergeClose(busy);
}

/** The profile's name on the person whose face is the avatar's (onboarding's "That's me"). */
async function nameMe() {
  if (saved.me || !state.list.length) return;
  const p = await getProfile();
  if (!p.name || !p.avatar) return;
  const f = (await ClipEmbedder!.faces([p.avatar], 0.6, true))[0]?.faces[0];
  const me = f && faceVec(f);
  if (!me) return;
  const hits = (x: Person) => x.shots.filter((sh) => isAnyOf(sh.f, [me])).length;
  const best = state.list.reduce((a, b) => (hits(b) > hits(a) ? b : a));
  if (!hits(best)) return;
  if (!state.list.some((x) => same(x.name, p.name))) best.shots.forEach((x) => (saved.names[x.key] = p.name));
  saved.me = true;
  save();
  publish();
}

async function scan(photos: { uri: string }[], busy: () => boolean) {
  const here = new Set(photos.map((p) => p.uri));
  const gone = Object.keys(saved.scans).filter((u) => !here.has(u));
  gone.forEach((u) => delete saved.scans[u]);
  const todo = photos.filter((p) => !saved.scans[p.uri]).reverse(); // newest first, like indexing
  const checkpoint = async () => { await group(busy); save(); publish(); };
  if (!grouped.size) { // this launch's first: the saved groups go back in, so new faces can join them
    const had = !!saved.groups;
    await group(busy);
    if (!had && Object.keys(saved.scans).length) save();
    publish();
  }
  const t0 = Date.now();
  for (let i = 0; i < todo.length; i += BATCH) {
    await breathe(busy);
    const batch = todo.slice(i, i + BATCH);
    const res = await ClipEmbedder!.faces(batch.map((p) => p.uri), 0.6, true);
    batch.forEach((p, k) => (saved.scans[p.uri] = res[k]));
    if ((i / BATCH) % CHECKPOINT === CHECKPOINT - 1) await checkpoint();
  }
  if (todo.length || gone.length) { await checkpoint(); console.log(`[people] scanned ${todo.length} photos in ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
  await nameMe();
}

let loaded = false;
let running = false;
let pending: { uri: string }[] | null = null;
/**
 * Finds the faces in photos not scanned yet and groups them, on the phone. One run at a time: photos arriving meanwhile wait
 * for the next. busy: true while it should hold off. Waits for the faces pack, showing the saved people in the meantime.
 */
export async function scanPeople(photos: { uri: string }[], busy: () => boolean) {
  pending = photos;
  if (running || !ClipEmbedder) return;
  running = true;
  try {
    if (!loaded) {
      try { const f = file(); if (f.exists) saved = { ...saved, ...JSON.parse(await f.text()) }; } catch (e) { console.warn('[people] load failed:', e); }
      if (saved.grouping !== GROUPING) { delete saved.groups; saved.grouping = GROUPING; }
      loaded = true;
      publish();
    }
    await whenReady('faces');
    while (pending) { const ps = pending; pending = null; await scan(ps, busy); }
  } catch (e) {
    console.warn('[people] scan failed:', e);
  } finally {
    running = false;
  }
}
