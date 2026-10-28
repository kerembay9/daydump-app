import { ClipEmbedder, type Face } from '../../modules/clip-embedder';
import { embedText, IndexedPhoto, Library } from './index/photoIndex';
import { b64ToFloats, dot, isZero } from './index/vectors';
import { isCameraPhoto } from './galleryService';
import { SAME_PERSON } from './faces';
import { ownerFace } from './tidy/scan';

/** Dump Meter (Discover's Today card): what a day's camera photos cover, slot by slot, for the "Soft day" checklist. */
export type Slot = 'you' | 'friends' | 'food' | 'sky' | 'closeup' | 'wide' | 'night' | 'mirror';
export const SLOTS: { key: Slot; label: string }[] = [
  { key: 'you', label: 'You' }, { key: 'friends', label: 'Friends' }, { key: 'food', label: 'Food' }, { key: 'sky', label: 'Sky' },
  { key: 'closeup', label: 'Close-up' }, { key: 'wide', label: 'Wide shot' }, { key: 'night', label: 'Night' }, { key: 'mirror', label: 'Mirror' },
];

/**
 * CLIP phrases. A photo fills every phrase slot that scores over FLOOR and within MARGIN of its best phrase (zero-shot, multi-label:
 * a sunset over the city is Sky and Wide). you / friends: phrases only while faces can't tell (no profile photo or faces pack).
 */
const PHRASES: Partial<Record<Slot, string>> = {
  food: 'a photo of food or a drink on a table',
  sky: 'a photo of the sky, clouds or a sunset',
  closeup: 'a close-up photo of a small object or detail',
  wide: 'a wide photo of a landscape or a city street',
  night: 'a photo taken outside at night',
  mirror: 'a mirror selfie',
  you: 'a selfie of a person',
  friends: 'a photo of a group of friends',
};
/** ponytail: one floor + margin for every phrase (the search's 0.2 / 0.03); per-slot cutoffs if the tag test shows a phrase over- or under-firing */
const FLOOR = 0.2, MARGIN = 0.03;
/** Same shot (the stories' near-duplicate cutoff): a later take of an earlier photo counts as a duplicate, not a second photo. */
const SAME_SHOT = 0.92;
const NIGHT_FROM = 21, NIGHT_TO = 5;

export type DayPhoto = { p: IndexedPhoto; slots: Slot[]; scores: Partial<Record<Slot, number>>; faces: number; me: boolean; dupe: boolean };
export type DayCheck = { photos: DayPhoto[]; filled: Record<Slot, number>; got: number; pct: number; missing: Slot[]; dupes: number; faces: 'owner' | 'faces' | 'none' };

let phraseVecs: Promise<Record<string, Float32Array | null>> | null = null;
const facesCache = new Map<string, Face[]>();

/** Camera photos taken on `day`'s calendar day (local), in time order. */
export const photosOn = (lib: Library, day: number) => {
  const key = new Date(day).toDateString();
  return lib.photos.filter((p) => isCameraPhoto(p.uri) && new Date(p.creationTime).toDateString() === key).sort((a, b) => a.creationTime - b.creationTime);
};

export async function checkDay(lib: Library, day = Date.now()): Promise<DayCheck> {
  const photos = photosOn(lib, day);
  const row = new Map(lib.photos.map((p, i) => [p.id, i]));
  phraseVecs ??= Promise.all(Object.entries(PHRASES).map(async ([k, s]) => [k, await embedText(s).catch(() => null)] as const))
    .then(Object.fromEntries);
  const tv = await phraseVecs;
  if (Object.values(tv).every((v) => !v)) phraseVecs = null; // the text pack wasn't there yet: try again next time

  // faces: SFace against the profile photo; without a match target, any face only says "someone's in it"
  const owner = ClipEmbedder ? await ownerFace().catch(() => null) : null;
  const todo = photos.filter((p) => !facesCache.has(p.id));
  let haveFaces = !!ClipEmbedder;
  if (ClipEmbedder && todo.length) {
    const scans = await ClipEmbedder.faces(todo.map((p) => p.uri), 0.6, !!owner).catch(() => null);
    if (scans) todo.forEach((p, i) => facesCache.set(p.id, scans[i]?.faces ?? []));
    else haveFaces = false;
  }
  const isMe = (f: Face) => !!owner && !!f.vec && b64ToFloats(f.vec).reduce((a, x, k) => a + x * owner[k], 0) > SAME_PERSON;

  const out: DayPhoto[] = photos.map((p, i) => {
    const r = row.get(p.id)!;
    const scores: Partial<Record<Slot, number>> = {};
    if (!isZero(lib.vecs, r)) for (const [k, v] of Object.entries(tv)) if (v) scores[k as Slot] = dot(lib.vecs, r, v, 0);
    const faces = facesCache.get(p.id) ?? [];
    const me = faces.some(isMe);
    // faces decide you / friends when they can; the phrases stand in otherwise
    const byFace = haveFaces && facesCache.has(p.id);
    const phraseSlots = (Object.keys(scores) as Slot[]).filter((k) => !(byFace && owner && (k === 'you' || k === 'friends')));
    const best = Math.max(...phraseSlots.map((k) => scores[k]!));
    const slots = new Set(phraseSlots.filter((k) => scores[k]! >= FLOOR && scores[k]! >= best - MARGIN));
    if (byFace && owner) {
      if (me) slots.add('you');
      if (faces.some((f) => !isMe(f))) slots.add('friends');
    }
    const h = new Date(p.creationTime).getHours();
    if (h >= NIGHT_FROM || h < NIGHT_TO) slots.add('night');
    const dupe = photos.slice(0, i).some((q) => dot(lib.vecs, r, lib.vecs, row.get(q.id)!) >= SAME_SHOT);
    return { p, slots: SLOTS.map((s) => s.key).filter((k) => slots.has(k)), scores, faces: faces.length, me, dupe };
  });

  const filled = Object.fromEntries(SLOTS.map((s) => [s.key, 0])) as Record<Slot, number>;
  for (const d of out) if (!d.dupe) for (const s of d.slots) filled[s]++;
  const missing = SLOTS.map((s) => s.key).filter((k) => !filled[k]);
  const got = SLOTS.length - missing.length;
  return { photos: out, filled, got, pct: Math.round((got / SLOTS.length) * 100), missing, dupes: out.filter((d) => d.dupe).length, faces: owner && haveFaces ? 'owner' : haveFaces ? 'faces' : 'none' };
}

export const slotLabel = (k: Slot) => SLOTS.find((s) => s.key === k)!.label;
/** "you, sky and night" */
export const listSlots = (ks: Slot[]) => {
  const l = ks.map((k) => slotLabel(k).toLowerCase());
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}` : l[0] ?? '';
};
