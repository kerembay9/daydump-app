import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClipEmbedder, type Face } from '../../modules/clip-embedder';
import { embedText, IndexedPhoto, Library, reading } from './index/photoIndex';
import { b64ToFloats, dot, isZero } from './index/vectors';
import { isCameraPhoto } from './galleryService';
import { SAME_PERSON } from './faces';
import { ownerFace } from './tidy/scan';

/**
 * Today hub (Discover's Today card and /today): a 3x3 bingo of photo prompts with a free middle, drawn each day from what the
 * user shoots, one side quest a week (the same for everyone, a sticker on the day's print), and a mini print of the best photo for each
 * bingo day. Album shows the prints by week and by month.
 * No weather or clock prompts: any row wins, and one empty square a day can be swapped.
 */
export type Slot = 'coffee' | 'food' | 'sky' | 'closeup' | 'wide' | 'you' | 'friends' | 'mirror' | 'desk' | 'shoes' | 'plant' | 'hands' | 'window' | 'pet' | 'book' | 'blue';
/** label: the square's text. phrase: the CLIP phrase. you / friends: faces decide when they can (profile photo + faces pack). */
export const SLOTS: { key: Slot; label: string; phrase: string }[] = [
  { key: 'coffee', label: 'Coffee or tea', phrase: 'a photo of a cup of coffee or tea' },
  { key: 'food', label: 'Food', phrase: 'a photo of food or a drink on a table' },
  { key: 'sky', label: 'The sky', phrase: 'a photo of the sky, clouds or a sunset' },
  { key: 'closeup', label: 'A close-up', phrase: 'a close-up photo of a small object or detail' },
  { key: 'wide', label: 'Somewhere wide', phrase: 'a wide photo of a landscape or a city street' },
  { key: 'you', label: 'You', phrase: 'a selfie of a person' },
  { key: 'friends', label: 'Someone else', phrase: 'a photo of a group of friends' },
  { key: 'mirror', label: 'A mirror', phrase: 'a mirror selfie' },
  { key: 'desk', label: 'Your desk', phrase: 'a photo of a desk with a laptop or papers' },
  { key: 'shoes', label: 'Your shoes', phrase: 'a photo of shoes on feet' },
  { key: 'plant', label: 'A plant', phrase: 'a photo of a plant or flowers' },
  { key: 'hands', label: 'Your hands', phrase: 'a photo of hands holding something' },
  { key: 'window', label: 'A window', phrase: 'a photo of a window or the view through it' },
  { key: 'pet', label: 'An animal', phrase: 'a photo of a dog or a cat' },
  { key: 'book', label: 'Something to read', phrase: 'a photo of a book or a magazine' },
  { key: 'blue', label: 'Something blue', phrase: 'a photo of something blue' },
];
/** Side quests: one a week (Monday to Sunday), the same for everyone (the week number picks it), so each comes back in ~7 months. */
export const QUESTS: { key: string; label: string; phrase: string }[] = [
  ['red', 'Something red', 'a photo of something red'], ['yellow', 'Something yellow', 'a photo of something yellow'],
  ['round', 'Something round', 'a photo of a round object'], ['stairs', 'Stairs', 'a photo of stairs'],
  ['door', 'A doorway', 'a photo of a door or a doorway'], ['clock', 'A clock', 'a photo of a clock'],
  ['shadow', 'A shadow', 'a photo of a long shadow'], ['reflection', 'A reflection', 'a photo of a reflection in water or glass'],
  ['sign', 'A sign', 'a photo of a street sign'], ['bike', 'A bicycle', 'a photo of a bicycle'],
  ['dog', 'A dog', 'a photo of a dog'], ['cat', 'A cat', 'a photo of a cat'],
  ['flowers', 'Flowers', 'a photo of flowers'], ['bridge', 'A bridge', 'a photo of a bridge'],
  ['fruit', 'Fruit', 'a photo of fruit'], ['bird', 'A bird', 'a photo of a bird'],
  ['tree', 'A tree', 'a photo of a tree'], ['water', 'Water', 'a photo of the sea, a lake or a river'],
  ['art', 'Street art', 'a photo of graffiti or a mural'], ['keys', 'Your keys', 'a photo of keys'],
  ['candle', 'A candle', 'a photo of a candle'], ['green', 'Something green', 'a photo of something green'],
  ['pattern', 'A pattern', 'a photo of a repeating pattern'], ['car', 'A car', 'a photo of a car'],
  ['bread', 'Bread', 'a photo of bread or pastries'], ['lights', 'Lights', 'a photo of lamps or string lights'],
  ['bottle', 'A bottle', 'a photo of a bottle'], ['chair', 'A chair', 'a photo of a chair'],
  ['ticket', 'A ticket', 'a photo of a ticket or a receipt'], ['music', 'Music', 'a photo of a musical instrument or a record'],
].map(([key, label, phrase]) => ({ key, label, phrase }));

/**
 * A phrase matches when it's over FLOOR and stands out from the photo's scores for the 16 prompts by Z standard deviations: a dark
 * or busy photo scores every phrase alike (0.19-0.24 for a plant by a screen) and matches none. Z from the phone's Today tags:
 * every true match was 2.0 or more, the false ones 1.8 or less.
 * ponytail: one Z for every phrase; per-slot cutoffs if the tag screen shows a phrase over- or under-firing
 */
const FLOOR = 0.2, Z = 1.9;
/** Same shot (the stories' near-duplicate cutoff): a later take of an earlier photo counts as a duplicate, not a second photo. */
const SAME_SHOT = 0.92;
const DAY = 86_400_000;
/** The card is drawn from this many days before today. A people square needs people on at least PEOPLE_DAYS of the days with photos. */
const HISTORY_DAYS = 60, PEOPLE_DAYS = 0.5;
export const FREE = 4;
export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export type DayPhoto = { p: IndexedPhoto; slots: Slot[]; quest: boolean; scores: Partial<Record<string, number>>; faces: number; me: boolean; dupe: boolean };
export type DayCheck = { photos: DayPhoto[]; filled: Record<Slot, number>; quest: (typeof QUESTS)[number]; questFound: boolean; questUri?: string; dupes: number; faces: 'owner' | 'faces' | 'none' };

const phraseVecs = new Map<string, Promise<Float32Array | null>>();
const facesCache = new Map<string, Face[]>();

const vecOf = (phrase: string) => {
  let v = phraseVecs.get(phrase);
  if (!v) phraseVecs.set(phrase, (v = embedText(phrase).catch(() => null)));
  return v.then((x) => { if (!x) phraseVecs.delete(phrase); return x; }); // the text pack wasn't there yet: try again next time
};
const vecsOf = async (list: { key: string; phrase: string }[]) => Object.fromEntries(await Promise.all(list.map(async (s) => [s.key, await vecOf(s.phrase)] as const)));

/** Local calendar day, "2026-10-28". */
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayNo = (t: number) => { const d = new Date(t); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };
/** Monday 00:00 (local) of `t`'s week. */
export const monday = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
/** Day 0 (Jan 1, 1970) was a Thursday: +3 starts weeks on Monday. */
const weekNo = (t: number) => Math.floor((dayNo(t) + 3) / 7);
export const questFor = (day: number) => QUESTS[((weekNo(day) * 7) % QUESTS.length + QUESTS.length) % QUESTS.length];

/** Camera photos taken on `day`'s calendar day (local), in time order. */
export const photosOn = (lib: Library, day: number) => {
  const key = new Date(day).toDateString();
  return lib.photos.filter((p) => isCameraPhoto(p.uri) && new Date(p.creationTime).toDateString() === key).sort((a, b) => a.creationTime - b.creationTime);
};

/** Zero-shot, multi-label: every phrase over FLOOR and Z standard deviations over the mean of the prompts' scores. */
export const hits = (scores: Record<string, number>, skip?: (k: string) => boolean) => {
  const xs = SLOTS.map((s) => scores[s.key]).filter((x) => x != null);
  const m = xs.reduce((a, x) => a + x, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
  return Object.keys(scores).filter((k) => !skip?.(k) && scores[k] >= FLOOR && scores[k] - m >= Z * sd);
};

export async function checkDay(lib: Library, day = Date.now()): Promise<DayCheck> {
  const photos = photosOn(lib, day);
  const row = new Map(lib.photos.map((p, i) => [p.id, i]));
  const quest = questFor(day);
  const tv = await vecsOf([...SLOTS, quest]);

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
    const scores: Record<string, number> = {};
    if (!isZero(lib.vecs, r)) for (const [k, v] of Object.entries(tv)) if (v) scores[k] = dot(lib.vecs, r, v, 0);
    const faces = facesCache.get(p.id) ?? [];
    const me = faces.some(isMe);
    // faces decide you / friends when they can; the phrases stand in otherwise
    const byFace = haveFaces && facesCache.has(p.id) && !!owner;
    const got = new Set(hits(scores, (k) => byFace && (k === 'you' || k === 'friends')));
    if (byFace) {
      if (me) got.add('you');
      if (faces.some((f) => !isMe(f))) got.add('friends');
    }
    const dupe = photos.slice(0, i).some((q) => dot(lib.vecs, r, lib.vecs, row.get(q.id)!) >= SAME_SHOT);
    return { p, slots: SLOTS.map((s) => s.key).filter((k) => got.has(k)), quest: got.has(quest.key), scores, faces: faces.length, me, dupe };
  });

  const filled = Object.fromEntries(SLOTS.map((s) => [s.key, 0])) as Record<Slot, number>;
  for (const d of out) if (!d.dupe) for (const s of d.slots) filled[s]++;
  // the sticker's photo: the one that matches the quest best
  const qp = out.filter((d) => !d.dupe && d.quest).sort((a, b) => (b.scores[quest.key] ?? 0) - (a.scores[quest.key] ?? 0))[0];
  return { photos: out, filled, quest, questFound: !!qp, questUri: qp?.p.uri, dupes: out.filter((d) => d.dupe).length, faces: owner && haveFaces ? 'owner' : haveFaces ? 'faces' : 'none' };
}

/**
 * How often each prompt shows up: the share of days with camera photos, in the HISTORY_DAYS before `day`, that had one.
 * ponytail: phrases only (you / friends too): a face scan of 60 days is minutes on the phone; scan once in the background if they misjudge
 */
export async function slotRates(lib: Library, day: number): Promise<Record<Slot, number>> {
  const start = new Date(day).setHours(0, 0, 0, 0), from = start - HISTORY_DAYS * DAY;
  const tv = await vecsOf(SLOTS);
  const days = new Map<string, Set<string>>();
  lib.photos.forEach((p, r) => {
    if (p.creationTime < from || p.creationTime >= start || !isCameraPhoto(p.uri) || isZero(lib.vecs, r)) return;
    const k = dayKey(p.creationTime);
    const set = days.get(k) ?? new Set<string>();
    days.set(k, set);
    const scores: Record<string, number> = {};
    for (const [s, v] of Object.entries(tv)) if (v) scores[s] = dot(lib.vecs, r, v, 0);
    for (const s of hits(scores)) set.add(s);
  });
  const n = days.size || 1;
  return Object.fromEntries(SLOTS.map((s) => [s.key, [...days.values()].filter((d) => d.has(s.key)).length / n])) as Record<Slot, number>;
}

/** Seeded PRNG (mulberry32): the same card for the same day. */
const rng = (seed: string) => {
  let a = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => { a = (a + 0x6d2b79f5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32; };
};
const shuffle = <T,>(xs: T[], r: () => number) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** The prompts this user can get, easiest first (ties in a seeded order); a people square only if people are in most days. */
const ranked = (rates: Record<Slot, number>, day: string) => {
  const r = rng(day);
  const order = new Map(shuffle(SLOTS.map((s) => s.key), r).map((k, i) => [k, i]));
  return SLOTS.map((s) => s.key).filter((k) => k !== 'friends' || rates.friends >= PEOPLE_DAYS)
    .sort((a, b) => rates[b] - rates[a] || order.get(a)! - order.get(b)!);
};

/**
 * 9 cells ('' in the free middle): the 5 prompts shot most often and 3 stretches. The two easiest face each other across the free
 * middle, so two everyday photos are a bingo.
 */
export function drawCard(rates: Record<Slot, number>, day: string): { cells: (Slot | '')[] } {
  const r = rng(`card ${day}`);
  const all = ranked(rates, day);
  const easy = all.slice(0, 5), stretch = shuffle(all.slice(5), r).slice(0, 3);
  const cells: (Slot | '')[] = Array(9).fill('');
  cells[3] = easy[0]; cells[5] = easy[1];
  const rest = shuffle([...easy.slice(2), ...stretch], r);
  [0, 1, 2, 6, 7, 8].forEach((c, i) => { cells[c] = rest[i]; });
  return { cells };
}

// ---- state ----

/** One day: its card, the swap, the bingo print (uri of the day's best photo), the quest found, and which squares already popped. */
type Day = {
  cells: (Slot | '')[]; swapped?: boolean; print?: string; quest?: string; questUri?: string; seen?: Slot[];
  /** the user's fixes: the photo they put in a square, and photos they took out of one (it's not that) */
  pick?: Partial<Record<Slot, string>>; not?: Partial<Record<Slot, string[]>>;
  /** the photo the user chose for the print (Album: tap a polaroid) */
  printPick?: string;
};
type Game = { days: Record<string, Day> };
const KEY = '@daydump_today';
/** Album goes back this far. */
const KEEP_DAYS = 400;

let game: Game | null = null;
const load = async (): Promise<Game> => (game ??= await AsyncStorage.getItem(KEY).then((s) => (s ? JSON.parse(s) : { days: {} }), () => ({ days: {} })));
const save = () => AsyncStorage.setItem(KEY, JSON.stringify(game)).catch(() => {});

export type Cell = { i: number; key: Slot | ''; label: string; on: boolean; uri?: string; win: boolean };
export type WeekDay = { day: number; label: string; state: 'got' | 'miss' | 'wait'; uri?: string };
/** One day in Album: its bingo print, and the week's quest sticker when that day found it. */
export type AlbumDay = { print?: string; quest?: { label: string; uri?: string } };
export type Hub = {
  day: string; cells: Cell[]; got: number; bingo: boolean;
  /** the prompt that finishes a row soonest, when one does */
  near: string | null;
  swapsLeft: number;
  /** this week's quest: found (on `day`, by `uri`) on any day of it; `left` days to find it, today included */
  quest: { key: string; label: string; found: boolean; uri?: string; day?: string; left: number; from: number };
  /** the last 7 days, today last (Discover's card) */
  week: WeekDay[];
  /** every kept day with a print or a sticker, by dayKey */
  album: Record<string, AlbumDay>;
  /** squares filled since the user last looked, and whether this look is the bingo: Slot pop */
  fresh: Slot[]; freshBingo: boolean;
  /** today's non-dupe camera photos, in time order */
  photos: number; shots: string[];
};

/** Each week's quest sticks to the first day that found it (later days of the week find it again). */
function albumOf(g: Game) {
  const out: Record<string, AlbumDay> = {}, weeks = new Set<number>();
  for (const k of Object.keys(g.days).sort()) {
    const x = g.days[k], w = weekNo(new Date(k + 'T12:00').getTime());
    const q = x.quest && !weeks.has(w) ? { label: QUESTS.find((q) => q.key === x.quest)?.label ?? x.quest, uri: x.questUri } : undefined;
    if (q) weeks.add(w);
    if (x.print || q) out[k] = { print: x.print, quest: q };
  }
  return out;
}

const wins = (on: boolean[]) => LINES.filter((l) => l.every((i) => on[i]));

/** Fills one day's card from its photos: which cells are on (and by which photo), the wins, the print and the quest. */
function score(d: Day, c: DayCheck) {
  // one photo fills one square: the best photo-square pairs first (a face decides with s 1)
  // ponytail: greedy, a photo can take a square another photo needed; matching if two photos keep fighting over squares
  const by: Partial<Record<Slot, { uri: string; s: number }>> = {};
  const used = new Set<string>();
  // the user's picks first
  for (const k of d.cells) {
    const uri = k && d.pick?.[k];
    if (uri && c.photos.some((x) => x.p.uri === uri)) { by[k as Slot] = { uri, s: 1 }; used.add(uri); }
  }
  c.photos.filter((x) => !x.dupe).flatMap((x) => x.slots.filter((k) => d.cells.includes(k)).map((k) => ({ k, uri: x.p.uri, s: x.scores[k] ?? 1 })))
    .sort((a, b) => b.s - a.s)
    .forEach((m) => { if (!by[m.k] && !used.has(m.uri) && !d.not?.[m.k]?.includes(m.uri)) { by[m.k] = m; used.add(m.uri); } });
  const on = d.cells.map((k, i) => i === FREE || (!!k && !!by[k]));
  const w = wins(on);
  // the print: the user's choice, else it stays while its photo is still in a winning row, else the best photo of the rows
  if (w.length) {
    const won = w.flat().filter((i) => i !== FREE).map((i) => by[d.cells[i] as Slot]!);
    d.print = d.printPick ?? (won.some((m) => m.uri === d.print) ? d.print : won.sort((a, b) => b.s - a.s)[0]?.uri);
  } else if (c.photos.length) delete d.print; // a fix broke the row (no photos: not indexed yet, keep it)
  // rechecked every time, like the print (no photos: not indexed yet, keep it)
  if (c.questFound) { d.quest = c.quest.key; d.questUri = c.questUri; } else if (c.photos.length) { delete d.quest; delete d.questUri; }
  return { by, on, w };
}

let chain: Promise<unknown> = Promise.resolve();
const subs = new Set<(h: Hub) => void>();
let lastHub: Hub | null = null;
let lastLib: Library | null = null;

/**
 * Plays today on `lib`: draws today's card if needed, fills it, catches up the last 6 days (photos taken after the app last
 * looked), and saves. Calls run one after another; every subscriber gets the result.
 */
export function playToday(lib: Library, now = Date.now()): Promise<Hub> {
  lastLib = lib;
  const run = chain.then(async () => {
    const g = await load();
    const today = dayKey(now);
    if (!g.days[today]) g.days[today] = drawCard(await slotRates(lib, now), today);
    const d = g.days[today];
    const c = await checkDay(lib, now);
    const hadBingo = !!d.print;
    const { by, on, w } = score(d, c);
    for (let k = 1; k < 7; k++) {
      const t = now - k * DAY, past = g.days[dayKey(t)];
      if (past && !(past.print && past.quest)) score(past, await checkDay(lib, t));
    }
    for (const k of Object.keys(g.days)) if (dayNo(now) - dayNo(new Date(k + 'T12:00').getTime()) > KEEP_DAYS) delete g.days[k];
    const seen = new Set(d.seen ?? []);
    const fresh = d.cells.filter((k, i): k is Slot => !!k && on[i] && !seen.has(k as Slot));
    const winSet = new Set(w.flat());
    const near = LINES.map((l) => l.filter((i) => !on[i])).find((m) => m.length === 1);
    const album = albumOf(g);
    const from = monday(now);
    const foundOn = Array.from({ length: 7 }, (_, j) => dayKey(new Date(from).setDate(new Date(from).getDate() + j))).find((k) => album[k]?.quest && g.days[k].quest === c.quest.key);
    const hub: Hub = {
      day: today,
      cells: d.cells.map((k, i) => ({ i, key: k, label: k ? SLOTS.find((s) => s.key === k)!.label : 'Free', on: on[i], uri: k ? by[k]?.uri : undefined, win: winSet.has(i) })),
      got: on.filter(Boolean).length - 1,
      bingo: w.length > 0,
      near: near ? SLOTS.find((s) => s.key === d.cells[near[0]])!.label : null,
      swapsLeft: d.swapped ? 0 : 1,
      quest: { key: c.quest.key, label: c.quest.label, found: !!foundOn, uri: foundOn ? album[foundOn].quest!.uri : undefined, day: foundOn, left: 7 - (dayNo(now) - dayNo(from)), from },
      week: Array.from({ length: 7 }, (_, j) => {
        const t = now - (6 - j) * DAY, x = g.days[dayKey(t)];
        return { day: t, label: j === 6 ? 'Today' : new Date(t).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2), state: x?.print ? 'got' : j === 6 ? 'wait' : 'miss', uri: x?.print } as WeekDay;
      }),
      album,
      fresh, freshBingo: w.length > 0 && !hadBingo,
      photos: c.photos.filter((x) => !x.dupe).length,
      shots: c.photos.filter((x) => !x.dupe).map((x) => x.p.uri),
    };
    await save();
    lastHub = hub;
    subs.forEach((f) => f(hub));
    return hub;
  }).finally(() => { playedLib = lib; ticks.forEach((f) => f()); });
  chain = run.catch(() => {});
  return run;
}

let playedLib: Library | null = null;
const ticks = new Set<() => void>();
/** Today's "Checking…" line: new photos being read, then the card filling from them; null once it's up to date. */
export function useChecking(lib: Library | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    reading.subs.add(f); ticks.add(f);
    return () => { reading.subs.delete(f); ticks.delete(f); };
  }, []);
  const n = reading.n;
  return n ? `Checking ${n} new photo${n === 1 ? '' : 's'}…` : lib && lib !== playedLib ? 'Checking new photos…' : null;
}

/** Marks today's fresh squares as popped (call once the pop has played). */
export function seenFresh(h: Hub) {
  const d = game?.days[h.day];
  if (!d || !h.fresh.length) return;
  d.seen = [...new Set([...(d.seen ?? []), ...h.fresh])];
  void save();
  // a play may have landed during the pop: clear what popped on the newest hub, keep anything newer for its own pop
  if (!lastHub || lastHub.day !== h.day) return;
  const fresh = lastHub.fresh.filter((k) => !h.fresh.includes(k));
  const next = { ...lastHub, fresh, freshBingo: lastHub.freshBingo && !h.freshBingo };
  lastHub = next;
  subs.forEach((f) => f(next));
}

/** Swaps today's empty cell `i` for the next prompt not on the card (one swap a day). */
export async function swapCell(i: number) {
  const g = await load(), h = lastHub, d = g.days[h?.day ?? ''];
  if (!h || !d || d.swapped || i === FREE || h.cells[i].on || !lastLib) return;
  const rates = await slotRates(lastLib, Date.now());
  const next = ranked(rates, `swap ${h.day}`).find((k) => !d.cells.includes(k));
  if (!next) return;
  d.cells[i] = next;
  d.swapped = true;
  await save();
  await playToday(lastLib);
}

/** Fixes today's filled cell `i`: puts photo `uri` in it, or (null) takes its photo out, so the next best (or nothing) fills it. */
export async function setSquare(i: number, uri: string | null) {
  const g = await load(), h = lastHub, d = g.days[h?.day ?? ''], k = d?.cells[i];
  if (!h || !d || !k || !lastLib) return;
  const pick = (d.pick ??= {}), not = (d.not ??= {});
  if (uri) {
    for (const s of Object.keys(pick) as Slot[]) if (pick[s] === uri) delete pick[s];
    pick[k] = uri;
    not[k] = not[k]?.filter((u) => u !== uri);
  } else {
    delete pick[k];
    const was = h.cells[i].uri;
    if (was) not[k] = [...(not[k] ?? []), was];
  }
  await save();
  await playToday(lastLib);
}

/** Album: puts photo `uri` on day `key`'s print. */
export async function setPrint(key: string, uri: string) {
  const g = await load(), d = g.days[key];
  if (!d?.print || !lastLib) return;
  d.printPick = d.print = uri;
  await save();
  await playToday(lastLib);
}

/** The hub, kept current: plays today whenever the library changes; null until the first play. */
export function useHub(lib: Library | null) {
  const [h, setH] = useState(lastHub);
  useEffect(() => {
    subs.add(setH);
    return () => { subs.delete(setH); };
  }, []);
  useEffect(() => {
    // the card and the page both use this: one play per library (or per new day)
    if (lib && (lib !== lastLib || lastHub?.day !== dayKey(Date.now()))) playToday(lib).catch((e) => console.warn('[today] play failed:', e));
  }, [lib]);
  return h;
}

export const slotLabel = (k: Slot) => SLOTS.find((s) => s.key === k)!.label;
