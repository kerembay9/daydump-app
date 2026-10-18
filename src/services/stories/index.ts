import AsyncStorage from '@react-native-async-storage/async-storage';
import { CuratedCarousel } from '../../types';
import { GeminiService } from '../geminiService';
import { placeFor } from '../index/cityLookup';
import { embedText, IndexedPhoto, Library } from '../index/photoIndex';
import { dot, isZero, scoreAll } from '../index/vectors';
import { DEFAULT_TOPIC_OPTIONS, findTopics, TopicOptions } from './topics';
import { capitalize, dateRange, plural, seasonOf, topicTitle } from './titles';
import { findTrips, tripTitle } from './trips';

export type Story = {
  id: string;
  kind: 'trip' | 'topic' | 'search';
  title: string;
  subtitle: string;
  /** all member photos, time-ordered */
  photos: IndexedPhoto[];
  /** the 6 slides, near-duplicates removed, time-ordered */
  picks: IndexedPhoto[];
  concepts: string[];
  start: number;
  end: number;
  score: number;
  debug: Record<string, string | number>;
};

const SLIDES = 6;
const SEEN_KEY = '@daydump_seen_stories';
const DAY = 86_400_000;

export async function buildStories(lib: Library, topicOpts: TopicOptions = DEFAULT_TOPIC_OPTIONS): Promise<Story[]> {
  const row = new Map(lib.photos.map((p, i) => [p.id, i]));
  const seen = await getSeen();
  const now = Date.now();
  const recency = (end: number) => Math.exp(-(now - end) / (180 * DAY));

  const trips = findTrips(lib.photos, placeFor).map((t): Story => {
    const s = 3 + Math.log(t.photos.length) * 0.5 + 2 * recency(t.end);
    return {
      id: `trip:${t.place}:${t.start}`,
      kind: 'trip',
      title: tripTitle(t),
      subtitle: `${t.country} · ${dateRange(t.start, t.end)} · ${t.photos.length} photos`,
      photos: t.photos as IndexedPhoto[],
      picks: pick(t.photos as IndexedPhoto[], lib, row, () => 0),
      concepts: [],
      start: t.start, end: t.end,
      score: s,
      debug: { home: t.homeCity, days: t.days, photos: t.photos.length },
    };
  });

  const topics = lib.hasClip
    ? findTopics(lib.photos, lib.conceptNames, topicOpts).map((t): Story => {
        const s = t.score + 2 * recency(t.end);
        return {
          id: `topic:${t.conceptId}:${t.start}`,
          kind: 'topic',
          title: topicTitle(t),
          subtitle: `${dateRange(t.start, t.end)} · ${t.photos.length} photos`,
          photos: t.photos,
          picks: pick(t.photos, lib, row, (p) => p.conceptScores[p.concepts.indexOf(t.conceptId)] ?? 0),
          concepts: [t.name, ...t.related],
          start: t.start, end: t.end,
          score: s,
          debug: { share: +t.share.toFixed(3), days: t.days, photos: t.photos.length, topicScore: +t.score.toFixed(2) },
        };
      })
    : [];

  return [...trips, ...topics]
    .map((s) => (seen.has(s.id) ? { ...s, score: s.score * 0.3, debug: { ...s.debug, seen: 1 } } : s))
    .sort((a, b) => b.score - a.score);
}

/** Free-text theme -> story from CLIP text/image similarity. Null without CLIP or no match. */
export async function searchStory(lib: Library, query: string, minScore = 0.2, k = 40): Promise<Story | null> {
  const ranked = await searchRanked(lib, query);
  // Absolute floor plus "close to the best hit": CLIP cosines are low and query-dependent.
  const top = ranked.filter((x) => x.s >= minScore && x.s >= (ranked[0]?.s ?? 0) - 0.06).slice(0, k);
  if (!top.length) return null;
  const photos = top.map((x) => x.p).sort((a, b) => a.creationTime - b.creationTime);
  const sc = new Map(top.map((x) => [x.p.id, x.s]));
  const row = new Map(lib.photos.map((p, i) => [p.id, i]));
  const start = photos[0].creationTime, end = photos[photos.length - 1].creationTime;
  return {
    id: `search:${query}`,
    kind: 'search',
    title: capitalize(query.trim()),
    subtitle: `${dateRange(start, end)} · ${photos.length} photos`,
    photos,
    picks: pick(photos, lib, row, (p) => sc.get(p.id) ?? 0),
    concepts: [query],
    start, end,
    score: top[0].s,
    debug: { best: +top[0].s.toFixed(3), cutoff: +top[top.length - 1].s.toFixed(3) },
  };
}

/** Every embedded photo scored against the query, best first. */
export async function searchRanked(lib: Library, query: string): Promise<{ p: IndexedPhoto; s: number }[]> {
  const q = await embedText(query);
  if (!q) return [];
  const scores = scoreAll(lib.vecs, q);
  return lib.photos.map((p, i) => ({ p, s: scores[i], i })).filter((x) => !isZero(lib.vecs, x.i)).sort((a, b) => b.s - a.s);
}

/** Time-spread picks: best photo per time bucket, skipping near-duplicates (cosine > 0.95). */
export function pick(photos: IndexedPhoto[], lib: Library, row: Map<string, number>, quality: (p: IndexedPhoto) => number): IndexedPhoto[] {
  const sorted = [...photos].sort((a, b) => a.creationTime - b.creationTime);
  const chosen: IndexedPhoto[] = [];
  const isDup = (p: IndexedPhoto) =>
    chosen.some((c) => {
      const a = row.get(p.id), b = row.get(c.id);
      return a != null && b != null && !isZero(lib.vecs, a) && dot(lib.vecs, a, lib.vecs, b) > 0.95;
    });
  const buckets = Math.min(SLIDES, sorted.length);
  for (let b = 0; b < buckets; b++) {
    const slice = sorted.slice(Math.floor((b * sorted.length) / buckets), Math.floor(((b + 1) * sorted.length) / buckets));
    const best = slice.filter((p) => !isDup(p)).sort((x, y) => quality(y) - quality(x))[0];
    if (best) chosen.push(best);
  }
  for (const p of sorted) if (chosen.length < SLIDES && !chosen.includes(p) && !isDup(p)) chosen.push(p);
  return chosen.sort((a, b) => a.creationTime - b.creationTime);
}

export function toCarousel(s: Story): CuratedCarousel {
  const season = seasonOf((s.start + s.end) / 2);
  const base = GeminiService.runOnDeviceNanoEngine(s.picks, `${s.title} ${season}`, s.picks.length);
  const subject = s.concepts[0] ? plural(s.concepts[0]) : 'moments';
  const captions =
    s.kind === 'trip'
      ? {
          minimal: `${s.title.toLowerCase()} ✈️`,
          witty: 'out of office, fully in camera roll',
          story: `${s.subtitle.split(' · ')[1]} away from home. ${s.photos.length} photos, these are the keepers.`,
        }
      : {
          minimal: `${subject} season 🎞️`,
          witty: `${s.photos.length} photos of ${subject} and not a single regret`,
          story: `${dateRange(s.start, s.end)}, told in ${subject}.`,
        };
  return { ...base, id: s.id, themeTitle: s.title, themeDescription: s.subtitle, captions, isCustomTheme: s.kind === 'search' };
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
