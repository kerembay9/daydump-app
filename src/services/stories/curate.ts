import type { IndexedPhoto } from '../index/photoIndex';

/** Dump-worthiness 0-100 and group of every vocab tag, by vocab id (rated per tag, cross-checked with Gemini). */
const WORTH = require('./worth.json') as { n: number; groups: string[]; w: number[]; g: number[] };

/** Discover builds and curates stories this many at a time. */
export const PAGE = 30;
/** Topics of these groups are one-off private moments: only their densest burst of photos counts (topics.ts). */
export const EVENT_GROUPS = new Set(['couple', 'events', 'friends_party', 'family_kids']);
const LOW_GROUPS = new Set(['objects', 'screens', 'paper']);
/** Below this, a story waits for page 2. */
const MIN_WORTH = 0.2;
/** A top-3 tag scoring within this of the top tag also says what the photo is (cosines differ by ~0.003 per rank). */
const CLOSE = 0.005;
/** Score x (1 - W .. 1 + W) from worth 0 .. 1. On a 4k-photo library 0.8 beat 0.3 / 0.5 (page-1 mean worth 0.72 vs 0.63 / 0.69). */
const WORTH_WEIGHT = 0.8;

export const tagWorth = (c: number) => (WORTH.w[c] ?? 50) / 100;
export const tagGroup = (c: number) => WORTH.groups[WORTH.g[c]] ?? 'objects';
/** Below this a tag makes no topic: dull ("a laptop at work") or obscure ("ford e-series", "body man"). */
const MIN_TOPIC_WORTH = 0.4;
/** Worthy tags too vague to name a dump ("Happys", "Events", "Reds") or about who's in it, not what ("Daughters", "Faces"). */
const VAGUE = new Set(('interaction|conversation|emotion|fun|comfort|calm|curious|happy|cool|hang|sitting|taste|flavor|style|design|' +
  'color|energy|location|scene|phenomenon|season|atmosphere|light|sound|shade|event|competition|game|play|player|match|opening|' +
  'launch|landing|formation|arrangement|crush|top|model|present|world|spread|recreation|entertainment|tradition|sharing|close-up|' +
  'room|crew|team|squad|social group|passenger|elder|son|daughter|mother|father|cousin|child|human face|lip|hair|long hair|muscle|' +
  'ring finger|middle finger|black|blue|brown|green|pink|purple|red|yellow|tan|orange (color)|rose (color)|lemon (color)|' +
  'gold (color)|bronze (color)|electric blue|marine blue|royal blue|sky blue').split('|'));
/** Tags that never make a topic: people words ("woman", "adult", "nose") say who is in a photo, not what it's of; dull, obscure or vague ones. */
export const noTopic = (c: number, name = '') => tagGroup(c) === 'people' || tagWorth(c) < MIN_TOPIC_WORTH || VAGUE.has(name);

let warned = false;
/** worth.json is rated per vocab id: another vocab would read the wrong tags. Logs loudly once; callers skip curation. */
export function worthFits(vocabSize: number) {
  if (vocabSize === WORTH.n) return true;
  if (!warned) console.error(`[curate] worth.json rates ${WORTH.n} tags, the vocab has ${vocabSize}: rerate it. Stories are not curated.`);
  warned = true;
  return false;
}

/** IDs, bank cards, medical papers: the top tag, or a top-3 tag nearly as strong, is in the sensitive group. */
export const isSensitive = (p: IndexedPhoto) =>
  p.concepts.slice(0, 3).some((c, r) => tagGroup(c) === 'sensitive' && p.conceptScores[r] >= p.conceptScores[0] - CLOSE);

const DOC_GROUPS = new Set(['paper', 'screens']);
/** Bank statements, worksheets, a laptop screen: a dull paper or screens tag (not a book or a ticket) on top, like isSensitive. */
export const isDocument = (p: IndexedPhoto) =>
  p.concepts.slice(0, 3).some((c, r) => DOC_GROUPS.has(tagGroup(c)) && tagWorth(c) < MIN_TOPIC_WORTH && p.conceptScores[r] >= p.conceptScores[0] - CLOSE);

/** Score-weighted mean worth of the photo's top 5 tags, 0-1 (0.5 untagged). */
export function photoWorth(p: IndexedPhoto) {
  let sw = 0, s = 0;
  p.concepts.slice(0, 5).forEach((c, r) => { sw += tagWorth(c) * p.conceptScores[r]; s += p.conceptScores[r]; });
  return s > 0 ? sw / s : 0.5;
}

export const boost = (score: number, worth: number) => score * (1 + WORTH_WEIGHT * (2 * worth - 1));

export type Curated = { score: number; group: string; worth: number };

const cap = (g: string) => (g === 'trip' || g === 'today' ? Infinity : LOW_GROUPS.has(g) ? 1 : 3);

/**
 * Discover's order from stories ranked best first, PAGE at a time: worth < 0.2 waits for page 2, at most 1 story per
 * low group (objects, screens, paper) and 3 per other group (trips, today: no cap), never two of a group in a row.
 * A page that can't fill under those rules relaxes them (caps, then adjacency), so every story stays reachable
 * and page 1 is never empty.
 */
export function curate<T extends Curated>(ranked: T[]): T[] {
  const rest = [...ranked];
  const out: T[] = [];
  for (let page = 0; rest.length; page++) {
    const per = new Map<string, number>();
    for (let n = 0; n < PAGE; n++) {
      const prev = out[out.length - 1]?.group;
      if (!rest.length) break;
      const fits = (s: T) => s.group !== prev && (page > 0 || s.worth >= MIN_WORTH);
      let i = rest.findIndex((s) => fits(s) && (per.get(s.group) ?? 0) < cap(s.group));
      if (i < 0) i = rest.findIndex(fits);
      if (i < 0) i = 0;
      const [s] = rest.splice(i, 1);
      per.set(s.group, (per.get(s.group) ?? 0) + 1);
      out.push(s);
    }
  }
  return out;
}
