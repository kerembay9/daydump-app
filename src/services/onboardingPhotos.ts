import type { IndexedPhoto } from './index/photoIndex';
import type { Story } from './stories';
import { isDocument, isSensitive, photoWorth, tagGroup, worthFits } from './stories/curate';

/** The photos onboarding shows after the permission question: the ones the app itself would put in a dump, not whatever is newest. */

/** Below this a photo is dull by its tags (a hand, a page of notes, a receipt): worth is 0-1, Discover's page 1 averages ~0.7. */
const MIN_WORTH = 0.55;
/** One story contributes at most this many photos to the pool, so it isn't one trip or one party. */
const PER_STORY = 2;
/** Shots this close in time are the same moment. */
const SAME_MOMENT = 10 * 60 * 1000;
/** Per group (pets, selfie, food...), so a library full of cat photos still shows other things. */
const PER_GROUP = 3;
/** The library pass only looks at this many of the newest photos. */
const RECENT = 800;

/** Fit for a print on a screen that sells the app: tagged, worth a dump, and neither a document nor private. */
export const showable = (p: IndexedPhoto) => p.concepts.length > 0 && photoWorth(p) >= MIN_WORTH && !isDocument(p) && !isSensitive(p);

/**
 * One strong photo per story, best story first, then a second round of seconds: the covers of the dumps Discover opens with.
 * Today's story is skipped (it is whatever the day's camera shot, hands and notes included) and so are stories rated low.
 */
export function poolFromStories(stories: Story[], n: number): string[] {
  const out: IndexedPhoto[] = [];
  const taken = new Set<string>();
  const ranked = stories.filter((s) => s.kind !== 'today' && s.kind !== 'recap' && s.worth >= 0.5)
    .map((s) => s.picks.filter(showable).sort((a, b) => photoWorth(b) - photoWorth(a)));
  for (let round = 0; round < PER_STORY && out.length < n; round++) {
    for (const picks of ranked) {
      const p = picks[round];
      if (p && !taken.has(p.id) && out.length < n) { taken.add(p.id); out.push(p); }
    }
  }
  return out.map((p) => p.uri);
}

/**
 * Before any story exists: the best of the newest indexed photos by tag worth, no two from the same moment, at most PER_GROUP per kind.
 * Less than n back = the index has not read enough yet; the caller keeps what it has.
 */
export function poolFromLibrary(photos: IndexedPhoto[], conceptNames: number, n: number): string[] {
  if (!worthFits(conceptNames)) return [];
  const best = photos.slice(-RECENT).filter(showable).sort((a, b) => photoWorth(b) - photoWorth(a));
  const out: IndexedPhoto[] = [];
  const per = new Map<string, number>();
  for (const p of best) {
    const g = tagGroup(p.concepts[0]);
    if ((per.get(g) ?? 0) >= PER_GROUP || out.some((o) => Math.abs(o.creationTime - p.creationTime) < SAME_MOMENT)) continue;
    per.set(g, (per.get(g) ?? 0) + 1);
    out.push(p);
    if (out.length === n) break;
  }
  return out.map((p) => p.uri);
}
