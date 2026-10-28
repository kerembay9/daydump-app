import AsyncStorage from '@react-native-async-storage/async-storage';
import { placeFor } from '../index/cityLookup';
import { embedText, IndexedPhoto, Library } from '../index/photoIndex';
import { dot, isZero, scoreAll } from '../index/vectors';
import { DEFAULT_TOPIC_OPTIONS, findTopics, TopicOptions } from './topics';
import { capitalize, dateRange, disambiguate, MONTH_NAMES, topicTitle } from './titles';
import { isCameraPhoto, isScreenshot } from '../galleryService';
import { profileNow, type Profile } from '../profile';
import { findTrips, tripTitle } from './trips';
import { boost, curate, EVENT_GROUPS, isDocument, isSensitive, noTopic, photoWorth, tagGroup, tagWorth, worthFits } from './curate';
import { BLUR_LAP, isBlack, shotCheck, type TPhoto } from '../tidy/rules';
import type { TidyStats } from '../../../modules/clip-embedder';

export type Story = {
  id: string;
  /** today = the day's camera photos (the 8 PM recap), ranked like the rest; recap = the week, month or year (recapPeriods) */
  kind: 'trip' | 'topic' | 'search' | 'today' | 'recap';
  title: string;
  /** meta line: "{picks} photos · {date range}" */
  subtitle: string;
  /** all member photos, time-ordered */
  photos: IndexedPhoto[];
  /** the slides (slideCount: the Profile's range, default 4-10), near-duplicates removed, time-ordered */
  picks: IndexedPhoto[];
  concepts: string[];
  /** trips: "City, CC" */
  place?: string;
  start: number;
  end: number;
  score: number;
  /** curation: the topic tag's group ('trip', 'today', 'search' for those) and dump-worthiness 0-1 (curate.ts) */
  group: string;
  worth: number;
  debug: Record<string, string | number>;
};

/**
 * Slides per dump, min-max (Profile, default 4-10) on a gentle hump: the middle count is twice as likely as either end
 * (4-10: 10% each end, 20% for 7). Seeded by the story id, so a story keeps its count across rebuilds.
 */
export function slideCount(id: string, min = 4, max = 10) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const n = max - min;
  const w = Array.from({ length: n + 1 }, (_, i) => 2 - Math.abs((2 * i) / (n || 1) - 1));
  let r = ((Math.abs(h) % 1000) / 1000) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) if ((r -= w[i]) < 0) return min + i;
  return max;
}
const MIN_TODAY = 3;
/** A topic with more than this share of its photos in a trip is that trip's story ("A summer of pasta" = the Rome trip). */
const IN_TRIP = 0.6;
/** Each dump made from a story of a group (draft or post) ranks the group's stories up this much, up to 3 dumps. */
/** A recap scores at least this x the best other story. */
const RECAP_TOP = 0.9;
const MADE_BOOST = 0.1;
/** Trips and today scored like a topic: sqrt(photos) x days x this (topics also multiply by cosine x log(1/share), ~1-1.5). */
const TRIP_K = 1.2;
const SEEN_KEY = '@daydump_seen_stories';
const DAY = 86_400_000;

export type Recap = { id: string; title: string; start: number; end: number; minPhotos: number; minDays: number };

/**
 * The recaps on offer at `now` (local time, weeks from Monday): the week ("This week" from Thursday, "Last week" until
 * then), the month in its last 7 days and the first 7 of the next, the year from Dec 1 to Jan 10.
 */
export function recapPeriods(now = Date.now()): Recap[] {
  const d = new Date(now);
  const [y, m, day] = [d.getFullYear(), d.getMonth(), d.getDate()];
  const dow = (d.getDay() + 6) % 7;
  const late = dow >= 3;
  const wk = new Date(y, m, day - dow - (late ? 0 : 7));
  const out: Recap[] = [{
    id: `recap:week:${wk.toDateString()}`, title: late ? 'This week' : 'Last week',
    start: wk.getTime(), end: new Date(y, m, day - dow + (late ? 7 : 0)).getTime(), minPhotos: 8, minDays: 3,
  }];
  const daysLeft = new Date(y, m + 1, 0).getDate() - day;
  const mo = daysLeft < 7 ? m : day <= 7 ? m - 1 : null;
  if (mo != null) {
    const a = new Date(y, mo, 1);
    out.push({ id: `recap:month:${a.getFullYear()}-${a.getMonth() + 1}`, title: MONTH_NAMES[a.getMonth()], start: a.getTime(), end: new Date(y, mo + 1, 1).getTime(), minPhotos: 12, minDays: 4 });
  }
  const yr = m === 11 ? y : m === 0 && day <= 10 ? y - 1 : null;
  if (yr != null) out.push({ id: `recap:year:${yr}`, title: `Your ${yr}`, start: new Date(yr, 0, 1).getTime(), end: new Date(yr + 1, 0, 1).getTime(), minPhotos: 20, minDays: 10 });
  return out;
}

/**
 * Ranked stories, best first: the top `limit` get their picks (the costly part: embeddings + near-duplicate checks),
 * the rest are only counted (`available`) so Discover can offer "Show more" without building them.
 * With CLIP tags the order is curated (curate.ts): worth folded into the score, group caps per page, and with
 * hideSensitive no sensitive topic or photo anywhere. Without screenshots, no Screenshots-folder photo.
 */
export async function buildStories(lib: Library, topicOpts: TopicOptions = DEFAULT_TOPIC_OPTIONS, limit = Infinity, { hideSensitive, screenshots, slidesMin = 4, slidesMax = 10, made = [] }: Pick<Profile, 'hideSensitive' | 'screenshots'> & Partial<Pick<Profile, 'slidesMin' | 'slidesMax'>> & {
  /** story ids of the dumps made from Discover (drafts and posts): their groups rank up */
  made?: string[];
} = { hideSensitive: true, screenshots: false }): Promise<{ stories: Story[]; available: number }> {
  const row = new Map(lib.photos.map((p, i) => [p.id, i]));
  const seen = await getSeen();
  const now = Date.now();
  const recency = (end: number) => Math.exp(-(now - end) / (180 * DAY));
  // no CLIP = no tags to judge by
  const curated = lib.hasClip && worthFits(lib.conceptNames.length);
  // screenshots (a book page, a chat) get content tags like "reading" and would make dumps of themselves; so would photos of
  // statements and worksheets (screenshots stay in when asked for)
  const photos = lib.photos.filter((p) => (screenshots || !isScreenshot(p.uri)) && !(curated && hideSensitive && isSensitive(p))
    && !(curated && !isScreenshot(p.uri) && isDocument(p)));
  const pw = new Map(curated ? photos.map((p) => [p.id, photoWorth(p)]) : []);
  const meanWorth = (ps: IndexedPhoto[]) => ps.reduce((a, p) => a + (pw.get(p.id) ?? 0.5), 0) / ps.length;

  const trips = findTrips(photos, placeFor).map((t): Story => {
    const worth = meanWorth(t.photos as IndexedPhoto[]);
    // same scale as a topic's sqrt(n) * days score (topics.ts), else trips sink below every topic
    const s = boost(TRIP_K * Math.sqrt(t.photos.length) * Math.min(t.days, 5) + 2 * recency(t.end), worth);
    return {
      id: `trip:${t.place}:${t.start}`,
      kind: 'trip',
      title: tripTitle(t),
      subtitle: '',
      photos: t.photos as IndexedPhoto[],
      picks: [],
      concepts: [],
      place: `${t.place}, ${t.country}`,
      start: t.start, end: t.end,
      score: s,
      group: 'trip', worth,
      debug: { home: t.homeCity, days: t.days, photos: t.photos.length },
    };
  });

  const inTrip = new Set(trips.flatMap((t) => t.photos));
  const topics = lib.hasClip
    ? findTopics(photos, lib.conceptNames, topicOpts, curated ? (c) => EVENT_GROUPS.has(tagGroup(c)) : undefined, curated ? (c) => noTopic(c, lib.conceptNames[c]) : undefined)
      .filter((t) => !(curated && hideSensitive && tagGroup(t.conceptId) === 'sensitive'))
      .filter((t) => t.photos.filter((p) => inTrip.has(p)).length <= IN_TRIP * t.photos.length)
      .map((t): Story => {
        const worth = curated ? 0.6 * tagWorth(t.conceptId) + 0.4 * meanWorth(t.photos) : 0.5;
        const s = boost(t.score + 2 * recency(t.end), worth);
        return {
          id: `topic:${t.conceptId}:${t.start}`,
          kind: 'topic',
          title: topicTitle(t),
          subtitle: '',
          photos: t.photos,
          picks: [],
          concepts: [t.name, ...t.related],
          start: t.start, end: t.end,
          score: s,
          group: curated ? tagGroup(t.conceptId) : 'topic', worth,
          debug: { share: +t.share.toFixed(3), days: t.days, photos: t.photos.length, topicScore: +t.score.toFixed(2) },
        };
      })
    : [];

  const todayKey = new Date(now).toDateString();
  const todays = photos.filter((p) => isCameraPhoto(p.uri) && new Date(p.creationTime).toDateString() === todayKey)
    .sort((a, b) => a.creationTime - b.creationTime);
  const today: Story[] = todays.length < MIN_TODAY ? [] : [{
    id: `today:${todayKey}`,
    kind: 'today',
    title: 'Today',
    subtitle: '',
    photos: todays,
    picks: [],
    concepts: [],
    start: todays[0].creationTime, end: todays[todays.length - 1].creationTime,
    // same recipe as a trip: no pinning, it just tends to rank high because it's recent
    score: boost(TRIP_K * Math.sqrt(todays.length) * 3 + 2, meanWorth(todays)),
    group: 'today', worth: meanWorth(todays),
    debug: { photos: todays.length },
  }];

  // recaps come and go with the calendar: one ranked 12th is never seen, so it ranks just under the best story while it's on
  const top = [...today, ...trips, ...topics].reduce((m, s) => Math.max(m, s.score), 0);
  const camera = photos.filter((p) => isCameraPhoto(p.uri));
  const recaps = recapPeriods(now).flatMap((r): Story[] => {
    const ps = camera.filter((p) => p.creationTime >= r.start && p.creationTime < r.end);
    const days = new Set(ps.map((p) => new Date(p.creationTime).toDateString())).size;
    if (ps.length < r.minPhotos || days < r.minDays) return [];
    const worth = meanWorth(ps);
    const end = ps[ps.length - 1].creationTime;
    return [{
      id: r.id, kind: 'recap', title: r.title, subtitle: '', photos: ps, picks: [], concepts: [],
      start: ps[0].creationTime, end,
      // like today, on a capped count: a year of photos is one story, not 70 trips' worth
      score: Math.max(boost(TRIP_K * Math.sqrt(Math.min(ps.length, 60)) * 3 + 2 * recency(end), worth), RECAP_TOP * top),
      group: 'recap', worth,
      debug: { photos: ps.length, days },
    }];
  });

  const madeBy = new Map<string, number>();
  for (const id of made) { const g = groupOfId(id, curated); madeBy.set(g, (madeBy.get(g) ?? 0) + 1); }
  const ranked = disambiguate([...today, ...recaps, ...trips, ...topics])
    .map((s) => {
      const k = Math.min(madeBy.get(s.group) ?? 0, 3);
      return k ? { ...s, score: s.score * (1 + MADE_BOOST * k), debug: { ...s.debug, made: k } } : s;
    })
    .map((s) => (seen.has(s.id) ? { ...s, score: s.score * 0.3, debug: { ...s.debug, seen: 1 } } : s))
    .sort((a, b) => b.score - a.score);
  const order = curated ? curate(ranked) : ranked;
  const worthOf = curated ? (p: IndexedPhoto) => pw.get(p.id) ?? 0.5 : undefined;
  const picked = order.slice(0, limit).map((s) => {
    const id = s.kind === 'topic' ? Number(s.id.split(':')[1]) : null;
    return withMeta({ ...s, picks: pick(s.photos, lib, row, id == null ? () => 0 : (p) => p.conceptScores[p.concepts.indexOf(id)] ?? 0, slideCount(s.id, slidesMin, slidesMax), worthOf) });
  });
  return { stories: picked, available: order.length };
}

/** A story id's group, as buildStories sets it: "topic:12:…" -> tag 12's group, "trip:…" -> 'trip'. */
function groupOfId(id: string, curated: boolean) {
  const [kind, c] = id.split(':');
  return kind !== 'topic' ? kind : curated ? tagGroup(Number(c)) : 'topic';
}

/** "{N} photos · {range}", N = the dump that opens (picks), not the whole story. Trips drop the country: the title names the place. */
const withMeta = (s: Story): Story => {
  // the picks' own span, so count and range describe the same photos
  const ts = s.picks.map((p) => p.creationTime);
  const [a, b] = ts.length ? [Math.min(...ts), Math.max(...ts)] : [s.start, s.end];
  return { ...s, subtitle: `${s.picks.length} photos · ${dateRange(a, b)}` };
};

/** Story by route id; "today" = today's story (the 8 PM notification links to /preview/today). */
export const storyById = (stories: Story[], id?: string) =>
  id === 'today' ? stories.find((s) => s.kind === 'today') : stories.find((s) => s.id === id);

/** Free-text theme -> story from CLIP text/image similarity. Null without CLIP or no match. */
export async function searchStory(lib: Library, query: string, minScore = 0.2, k = 40): Promise<Story | null> {
  const ranked = await searchRanked(lib, query);
  // Absolute floor plus "close to the best hit": CLIP cosines are low and query-dependent. 0.03 tuned on the eval album.
  const top = ranked.filter((x) => x.s >= minScore && x.s >= (ranked[0]?.s ?? 0) - 0.03).slice(0, k);
  if (!top.length) return null;
  const photos = top.map((x) => x.p).sort((a, b) => a.creationTime - b.creationTime);
  const sc = new Map(top.map((x) => [x.p.id, x.s]));
  const row = new Map(lib.photos.map((p, i) => [p.id, i]));
  const start = photos[0].creationTime, end = photos[photos.length - 1].creationTime;
  return withMeta({
    id: `search:${query}`,
    kind: 'search',
    title: capitalize(query.trim()),
    subtitle: '',
    photos,
    picks: pick(photos, lib, row, (p) => sc.get(p.id) ?? 0, slideCount(`search:${query}`, profileNow().slidesMin, profileNow().slidesMax),
      lib.hasClip && worthFits(lib.conceptNames.length) ? photoWorth : undefined),
    concepts: [query],
    start, end,
    score: top[0].s,
    group: 'search', worth: 1,
    debug: { best: +top[0].s.toFixed(3), cutoff: +top[top.length - 1].s.toFixed(3) },
  });
}

/** Every embedded photo scored against the query, best first. */
export async function searchRanked(lib: Library, query: string): Promise<{ p: IndexedPhoto; s: number }[]> {
  const q = await embedText(query);
  if (!q) return [];
  const scores = scoreAll(lib.vecs, q);
  return lib.photos.map((p, i) => ({ p, s: scores[i], i })).filter((x) => !isZero(lib.vecs, x.i)).sort((a, b) => b.s - a.s);
}

/** Photos less than this apart are one moment. */
const MOMENT = 2 * 3_600_000;
/** Tidy's same-shot rule (Tidy.kt): cosine >= 0.94 within 10 min; any time, > 0.95 is the same shot. */
const SHOT_MS = 10 * 60_000, SHOT_COS = 0.94, DUP_COS = 0.95;

const parse = <T,>(s: string | null | undefined): T | null => (s ? JSON.parse(s) as T : null);

/**
 * The slides. Photos less than 2 h apart are a moment; the moments are cut into n runs in time (each moment is a run
 * when there are fewer), and the runs take turns giving their best photo, so one big afternoon can't fill a dump.
 * Best = 0.4 relevance (0-1 within the story) + 0.6 looks: tag worth and Tidy's Shot checks (light, tilt, a finger,
 * faces cut or turned away; after a Tidy scan). Black frames, blurry shots and junk (worth < 0.25) only fill what's left.
 * No two takes of one shot. ponytail: weights by eye, like Tidy's rankSet; tune on labelled dumps.
 */
export function pick(photos: IndexedPhoto[], lib: Library, row: Map<string, number>, relevance: (p: IndexedPhoto) => number, n: number, worth?: (p: IndexedPhoto) => number): IndexedPhoto[] {
  const sorted = [...photos].sort((a, b) => a.creationTime - b.creationTime);
  const rel = sorted.map(relevance);
  // reduce, not Math.min(...): a year recap is thousands of photos
  const lo = rel.reduce((a, b) => Math.min(a, b), Infinity), span = rel.reduce((a, b) => Math.max(a, b), -Infinity) - lo;
  const score = new Map<IndexedPhoto, number>();
  const poor = new Set<IndexedPhoto>();
  sorted.forEach((p, i) => {
    const l = lib.looks?.get(p.id);
    const stats = parse<TidyStats>(l?.stats);
    const sharp = l?.sharp ?? undefined;
    const fails = stats ? shotCheck({ stats, fs: parse<TidyStats>(l?.faces) ?? undefined, sharp } as TPhoto).filter((c) => !c.ok).length : 0;
    const w = worth?.(p) ?? 0.5;
    if (isBlack(stats) || (sharp != null && sharp < BLUR_LAP) || w < 0.25) poor.add(p);
    score.set(p, 0.4 * (span > 0 ? (rel[i] - lo) / span : 0.5) + 0.6 * (0.5 * w + 0.5 * Math.max(0, 1 - 0.25 * fails)));
  });

  const moments: IndexedPhoto[][] = [];
  sorted.forEach((p, i) => { if (!i || p.creationTime - sorted[i - 1].creationTime > MOMENT) moments.push([]); moments[moments.length - 1].push(p); });
  const runs = moments.length <= n ? moments
    : Array.from({ length: n }, (_, b) => moments.slice(Math.floor((b * moments.length) / n), Math.floor(((b + 1) * moments.length) / n)).flat());
  runs.forEach((r) => r.sort((a, b) => score.get(b)! - score.get(a)!));

  const chosen: IndexedPhoto[] = [];
  const isDup = (p: IndexedPhoto) =>
    chosen.some((c) => {
      const a = row.get(p.id), b = row.get(c.id);
      if (a == null || b == null || isZero(lib.vecs, a)) return false;
      const cos = dot(lib.vecs, a, lib.vecs, b);
      return cos > DUP_COS || (cos >= SHOT_COS && Math.abs(p.creationTime - c.creationTime) <= SHOT_MS);
    });
  const fill = (ok: (p: IndexedPhoto) => boolean) => {
    for (let more = true; more && chosen.length < n;) {
      more = false;
      for (const r of runs) {
        if (chosen.length >= n) break;
        const p = r.find((x) => ok(x) && !chosen.includes(x) && !isDup(x));
        if (p) { chosen.push(p); more = true; }
      }
    }
  };
  fill((p) => !poor.has(p));
  fill(() => true);
  return chosen.sort((a, b) => a.creationTime - b.creationTime);
}

export async function markSeen(ids: string[]) {
  const seen = await getSeen();
  ids.forEach((id) => seen.add(id));
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-500)));
}

async function getSeen(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '[]'));
  } catch {
    return new Set();
  }
}
