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

/**
 * Topics from an inverted index over each photo's top vocab concepts (computed at index time).
 * Chosen over embedding clustering: O(n*k), and every topic comes with the word that explains it.
 */
export function findTopics(photos: IndexedPhoto[], names: string[], o: TopicOptions = DEFAULT_TOPIC_OPTIONS, isEvent?: (c: number) => boolean): Topic[] {
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
    if (all.length < o.minPhotos || share > o.maxShare) continue;
    all.sort((a, b) => a.p.creationTime - b.p.creationTime);
    // Private events keep one burst: another couple's engagement weeks later isn't "my engagement".
    const ev = isEvent?.(c) ?? false;
    const win = ev ? densestCluster(all, EVENT_GAP) : densestWindow(all, o.windowDays * DAY);
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
      score: Math.sqrt(win.length) * Math.log(1 / share) * mean * (ev ? 5 : Math.min(days, 5)),
    });
  }

  topics.sort((a, b) => b.score - a.score);
  // Merge near-identical topics ("cinnamon roll" vs "pastry" on the same photos).
  const kept: Topic[] = [];
  for (const t of topics) {
    const ids = new Set(t.photos.map((p) => p.id));
    const dup = kept.find((k) => jaccard(ids, k.photos) > 0.5);
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

function jaccard(a: Set<string>, b: { id: string }[]): number {
  let inter = 0;
  for (const p of b) if (a.has(p.id)) inter++;
  return inter / (a.size + b.length - inter);
}
