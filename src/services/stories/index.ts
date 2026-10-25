import AsyncStorage from '@react-native-async-storage/async-storage';
import { placeFor } from '../index/cityLookup';
import { embedText, IndexedPhoto, Library } from '../index/photoIndex';
import { dot, isZero, scoreAll } from '../index/vectors';
import { DEFAULT_TOPIC_OPTIONS, findTopics, TopicOptions } from './topics';
import { capitalize, dateRange, disambiguate, topicTitle } from './titles';
import { isCameraPhoto, isScreenshot } from '../galleryService';
import type { Profile } from '../profile';
import { findTrips, tripTitle } from './trips';
import { boost, curate, EVENT_GROUPS, isSensitive, photoWorth, tagGroup, tagWorth, worthFits } from './curate';

export type Story = {
  id: string;
  /** today = the day's camera photos (the 8 PM recap), ranked like the rest */
  kind: 'trip' | 'topic' | 'search' | 'today';
  title: string;
  /** meta line: "{picks} photos · {date range}" */
  subtitle: string;
  /** all member photos, time-ordered */
  photos: IndexedPhoto[];
  /** the 4-8 slides (slideCount), near-duplicates removed, time-ordered */
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

/** Slides per dump, 4-8 but mostly 6: seeded by the story id, so a story keeps its count across rebuilds. */
export function slideCount(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return [4, 5, 5, 6, 6, 6, 6, 6, 7, 7, 8][Math.abs(h) % 11];
}
const MIN_TODAY = 3;
/** Trips and today scored like a topic: sqrt(photos) x days x this (topics also multiply by cosine x log(1/share), ~1-1.5). */
const TRIP_K = 1.2;
const SEEN_KEY = '@daydump_seen_stories';
const DAY = 86_400_000;

/**
 * Ranked stories, best first: the top `limit` get their picks (the costly part: embeddings + near-duplicate checks),
 * the rest are only counted (`available`) so Discover can offer "Show more" without building them.
 * With CLIP tags the order is curated (curate.ts): worth folded into the score, group caps per page, and with
 * hideSensitive no sensitive topic or photo anywhere. Without screenshots, no Screenshots-folder photo.
 */
export async function buildStories(lib: Library, topicOpts: TopicOptions = DEFAULT_TOPIC_OPTIONS, limit = Infinity, { hideSensitive, screenshots }: Pick<Profile, 'hideSensitive' | 'screenshots'> = { hideSensitive: true, screenshots: false }): Promise<{ stories: Story[]; available: number }> {
  const row = new Map(lib.photos.map((p, i) => [p.id, i]));
  const seen = await getSeen();
  const now = Date.now();
  const recency = (end: number) => Math.exp(-(now - end) / (180 * DAY));
  // no CLIP = no tags to judge by
  const curated = lib.hasClip && worthFits(lib.conceptNames.length);
  // screenshots (a book page, a chat) get content tags like "reading" and would make dumps of themselves
  const photos = lib.photos.filter((p) => (screenshots || !isScreenshot(p.uri)) && !(curated && hideSensitive && isSensitive(p)));
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

  const topics = lib.hasClip
    ? findTopics(photos, lib.conceptNames, topicOpts, curated ? (c) => EVENT_GROUPS.has(tagGroup(c)) : undefined)
      .filter((t) => !(curated && hideSensitive && tagGroup(t.conceptId) === 'sensitive'))
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

  const ranked = disambiguate([...today, ...trips, ...topics])
    .map((s) => (seen.has(s.id) ? { ...s, score: s.score * 0.3, debug: { ...s.debug, seen: 1 } } : s))
    .sort((a, b) => b.score - a.score);
  const order = curated ? curate(ranked) : ranked;
  const picked = order.slice(0, limit).map((s) => {
    const id = s.kind === 'topic' ? Number(s.id.split(':')[1]) : null;
    return withMeta({ ...s, picks: pick(s.photos, lib, row, id == null ? () => 0 : (p) => p.conceptScores[p.concepts.indexOf(id)] ?? 0, slideCount(s.id)) });
  });
  return { stories: picked, available: order.length };
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
    picks: pick(photos, lib, row, (p) => sc.get(p.id) ?? 0, slideCount(`search:${query}`)),
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

/** Time-spread picks: best photo per time bucket, skipping near-duplicates (cosine > 0.95). */
export function pick(photos: IndexedPhoto[], lib: Library, row: Map<string, number>, quality: (p: IndexedPhoto) => number, n: number): IndexedPhoto[] {
  const sorted = [...photos].sort((a, b) => a.creationTime - b.creationTime);
  const chosen: IndexedPhoto[] = [];
  const isDup = (p: IndexedPhoto) =>
    chosen.some((c) => {
      const a = row.get(p.id), b = row.get(c.id);
      return a != null && b != null && !isZero(lib.vecs, a) && dot(lib.vecs, a, lib.vecs, b) > 0.95;
    });
  const buckets = Math.min(n, sorted.length);
  for (let b = 0; b < buckets; b++) {
    const slice = sorted.slice(Math.floor((b * sorted.length) / buckets), Math.floor(((b + 1) * sorted.length) / buckets));
    const best = slice.filter((p) => !isDup(p)).sort((x, y) => quality(y) - quality(x))[0];
    if (best) chosen.push(best);
  }
  for (const p of sorted) if (chosen.length < n && !chosen.includes(p) && !isDup(p)) chosen.push(p);
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
