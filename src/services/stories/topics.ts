import type { IndexedPhoto } from '../index/photoIndex';

export type Topic = {
  conceptId: number;
  name: string;
  /** other concepts that described (mostly) the same photos, merged into this topic */
  related: string[];
  photos: IndexedPhoto[];
  start: number;
  end: number;
  days: number;
  /** share of the whole library tagged with this concept (high = generic, e.g. "person") */
  share: number;
  score: number;
};

export type TopicOptions = {
  minPhotos: number;
  minDays: number;
  /** concepts tagging more than this share of the library are too generic to be a topic */
  maxShare: number;
  /** how many of each photo's top concepts count as tags */
  topK: number;
  /** a topic is the densest window of this many days (so "red" over 3 years becomes "A red winter") */
  windowDays: number;
};

export const DEFAULT_TOPIC_OPTIONS: TopicOptions = { minPhotos: 6, minDays: 3, maxShare: 0.25, topK: 5, windowDays: 120 };

const DAY = 86_400_000;
const EVENT_GAP = 2 * DAY;
/** A recurring tag makes up to this many topics: its densest window, then the densest of what's left. */
const MAX_WINDOWS = 3;
/** Rarity counts down to this share: rarer tags are as often a wrong tag as a niche one ("ford e-series"). */
const RARE = 0.01;
/** Topics with more than this share of the smaller one's photos in common are one topic. */
const SAME = 0.6;

/**
 * Topics from an inverted index over each photo's top vocab concepts (computed at index time).
 * Chosen over embedding clustering: O(n*k), and every topic comes with the word that explains it.
 * skip: tags that never make a topic (curate.ts noTopic: people words, dull or obscure tags).
 */
export function findTopics(photos: IndexedPhoto[], names: string[], o: TopicOptions = DEFAULT_TOPIC_OPTIONS, isEvent?: (c: number) => boolean, skip?: (c: number) => boolean): Topic[] {
  const n = photos.length;
  if (!n) return [];
  const postings = new Map<number, { p: IndexedPhoto; s: number }[]>();
  for (const p of photos)
    p.concepts.slice(0, o.topK).forEach((c, r) => {
      (postings.get(c) ?? postings.set(c, []).get(c)!).push({ p, s: p.conceptScores[r] });
    });

  const topics: Topic[] = [];
  for (const [c, all] of postings) {
    const share = all.length / n;
    if (all.length < o.minPhotos || share > o.maxShare || skip?.(c)) continue;
    all.sort((a, b) => a.p.creationTime - b.p.creationTime);
    // Private events keep one burst: another couple's engagement weeks later isn't "my engagement".
    const ev = isEvent?.(c) ?? false;
    let left = all;
    for (let k = 0; k < (ev ? 1 : MAX_WINDOWS) && left.length >= o.minPhotos; k++) {
      const win = ev ? densestCluster(left, EVENT_GAP) : densestWindow(left, o.windowDays * DAY);
      const used = new Set(win);
      left = left.filter((x) => !used.has(x));
      const days = new Set(win.map((x) => new Date(x.p.creationTime).toDateString())).size;
      // Recurring (spread over days) or one big event.
      if (win.length < o.minPhotos || (!ev && days < o.minDays && win.length < 2 * o.minPhotos)) continue;
      const mean = win.reduce((a, x) => a + x.s, 0) / win.length;
      topics.push({
        conceptId: c,
        name: names[c] ?? `concept ${c}`,
        related: [],
        photos: win.map((x) => x.p),
        start: win[0].p.creationTime,
        end: win[win.length - 1].p.creationTime,
        days,
        share,
        // an event is one burst by nature: no penalty for few days
        score: Math.sqrt(win.length) * Math.log(1 / Math.max(share, RARE)) * mean * (ev ? 5 : Math.min(days, 5)),
      });
    }
  }

  topics.sort((a, b) => b.score - a.score);
  // Merge topics on mostly the same photos ("pastry" on the cinnamon rolls, "latte art" inside "coffee"): the better one names it.
  const kept: Topic[] = [];
  for (const t of topics) {
    let ids: Set<IndexedPhoto> | undefined;
    const dup = kept.find((k) => k.start <= t.end && t.start <= k.end && shared((ids ??= new Set(t.photos)), k.photos) > SAME);
    if (dup) dup.related.push(t.name);
    else kept.push(t);
  }
  return kept;
}

function densestWindow<T extends { p: { creationTime: number } }>(sorted: T[], span: number): T[] {
  let best = [0, 0], lo = 0;
  for (let hi = 0; hi < sorted.length; hi++) {
    while (sorted[hi].p.creationTime - sorted[lo].p.creationTime > span) lo++;
    if (hi - lo > best[1] - best[0]) best = [lo, hi];
  }
  return sorted.slice(best[0], best[1] + 1);
}

/** Biggest run of time-sorted photos with no gap over `gap`. */
export function densestCluster<T extends { p: { creationTime: number } }>(sorted: T[], gap: number): T[] {
  let best = [0, 0], lo = 0;
  for (let hi = 1; hi <= sorted.length; hi++) {
    if (hi < sorted.length && sorted[hi].p.creationTime - sorted[hi - 1].p.creationTime <= gap) continue;
    if (hi - lo > best[1] - best[0]) best = [lo, hi];
    lo = hi;
  }
  return sorted.slice(best[0], best[1]);
}

/** Photos in common over the smaller set's size. */
function shared<T>(a: Set<T>, b: T[]): number {
  let inter = 0;
  for (const p of b) if (a.has(p)) inter++;
  return inter / Math.min(a.size, b.length);
}
