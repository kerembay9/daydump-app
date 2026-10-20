// Create's search box: "paris picnic may" -> place + date filters + a CLIP text query. Pure (no native imports), so
// scripts/selfcheck.ts can test it; the caller embeds `clip` (embedText) and passes the vector to searchLibrary.
import type { IndexedPhoto, Library } from '../index/photoIndex';
import { placeFor } from '../index/cityLookup';
import { DIM, isZero, scoreAll } from '../index/vectors';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const SEASONS: Record<string, number[]> = { spring: [2, 3, 4], summer: [5, 6, 7], autumn: [8, 9, 10], fall: [8, 9, 10], winter: [11, 0, 1] };
const MONTH_WORD = new Map<string, number>();
MONTHS.forEach((m, i) => { MONTH_WORD.set(m, i); MONTH_WORD.set(m.slice(0, 3), i); });
MONTH_WORD.set('sept', 8);

/** Place-name key: lowercase without accents, so "izmir" finds İzmir and "sao paulo" São Paulo. */
export const placeKey = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ı/g, 'i');

export type ParsedQuery = {
  /** 0-11; null = any month */
  months: Set<number> | null;
  years: Set<number> | null;
  /** a single local day (today / yesterday), as toDateString() */
  day: string | null;
  /** placeKey()s of cities / countries that occur in the library */
  places: string[];
  /** what's left, for CLIP; '' = none */
  clip: string;
};

/**
 * Month / season / year / today / yesterday -> date filter; words that name a city or country in the library
 * (isPlace, longest n-gram first: "new york") -> place filter; the rest -> CLIP. A place the library doesn't have
 * ("paris" with no GPS from Paris) stays a CLIP word, where it still finds Eiffel-tower-ish photos.
 */
export function parseQuery(text: string, isPlace: (name: string) => boolean, now = Date.now()): ParsedQuery {
  const words = text.toLowerCase().replace(/[,.;]/g, ' ').split(/\s+/).filter(Boolean);
  const months = new Set<number>(), years = new Set<number>(), places: string[] = [], rest: string[] = [];
  let day: string | null = null;
  for (let i = 0; i < words.length; ) {
    let n = 3;
    for (; n > 0; n--) if (i + n <= words.length && isPlace(placeKey(words.slice(i, i + n).join(' ')))) break;
    if (n) { places.push(placeKey(words.slice(i, i + n).join(' '))); i += n; continue; }
    const w = words[i++];
    if (MONTH_WORD.has(w)) months.add(MONTH_WORD.get(w)!);
    else if (SEASONS[w]) SEASONS[w].forEach((m) => months.add(m));
    else if (/^(19|20)\d\d$/.test(w)) years.add(+w);
    else if (w === 'today' || w === 'yesterday') day = new Date(now - (w === 'yesterday' ? 86_400_000 : 0)).toDateString();
    else rest.push(w);
  }
  return { months: months.size ? months : null, years: years.size ? years : null, day, places, clip: rest.join(' ') };
}

/** placeKey(city / country name) -> library rows taken there. Built once per library (placeFor ~µs a photo). */
const placeCache = new WeakMap<IndexedPhoto[], Map<string, Set<number>>>();
export function placeIndex(lib: Pick<Library, 'photos'>): Map<string, Set<number>> {
  let m = placeCache.get(lib.photos);
  if (m) return m;
  m = new Map();
  lib.photos.forEach((p, i) => {
    const pl = p.location && placeFor(p.location.latitude, p.location.longitude);
    if (!pl) return;
    for (const k of [placeKey(pl.city), placeKey(pl.country)]) (m!.get(k) ?? m!.set(k, new Set()).get(k)!).add(i);
  });
  placeCache.set(lib.photos, m);
  return m;
}

/**
 * Rows matching the query, best first: CLIP order when there are CLIP words (qvec), else newest first. With CLIP,
 * keeps hits within 0.06 of the best (cosines are low and query-dependent; same idea as searchStory's 0.03 cut).
 * ponytail: fixed 0.06 band + 300 cap, tuned by eye on one phone; per-query calibration if results feel off.
 */
export function searchLibrary(lib: Library, q: ParsedQuery, qvec: Float32Array | null): number[] {
  const places = q.places.length ? placeIndex(lib) : null;
  const ok = (p: IndexedPhoto, i: number) => {
    const d = new Date(p.creationTime);
    if (q.months && !q.months.has(d.getMonth())) return false;
    if (q.years && !q.years.has(d.getFullYear())) return false;
    if (q.day && d.toDateString() !== q.day) return false;
    if (places && !q.places.some((k) => places.get(k)?.has(i))) return false;
    return true;
  };
  const rows: number[] = [];
  for (let i = lib.photos.length - 1; i >= 0; i--) if (ok(lib.photos[i], i)) rows.push(i); // photos are oldest-first
  if (!q.clip) return rows;
  if (!qvec || qvec.length !== DIM) return [];
  const s = scoreAll(lib.vecs, qvec);
  const hits = rows.filter((i) => !isZero(lib.vecs, i)).sort((a, b) => s[b] - s[a]);
  const best = hits.length ? s[hits[0]] : 0;
  return hits.filter((i) => s[i] >= best - 0.06).slice(0, 300);
}
