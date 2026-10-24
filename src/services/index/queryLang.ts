// Search in other languages: the CLIP text towers only know English, so a query is also searched as its on-phone
// translation (ML Kit, QueryTranslateModule.kt), and emoji as their names. Create keeps each photo's best score.
import { useEffect, useState } from 'react';
import { QueryTranslate as QT } from '../../../modules/clip-embedder';
import { getProfile, Profile, profileNow, setProfile } from '../profile';

const EMOJI = require('./emojiNames.json') as Record<string, string>; // scripts/build_emoji_names.py
const EMOJI_KEYS = Object.keys(EMOJI).sort((a, b) => b.length - a.length); // longest first: 👨‍👩‍👧 before 👨

/** "🐶 on the 🏖️" -> "dog face on the beach with umbrella". Keys have no U+FE0F or skin tones. */
export function emojiToWords(s: string) {
  s = s.replace(/[️\u{1F3FB}-\u{1F3FF}]/gu, '');
  for (const k of EMOJI_KEYS) if (s.includes(k)) s = s.split(k).join(` ${EMOJI[k]} `);
  return s.replace(/\s+/g, ' ').trim();
}

export type LangState = 'ready' | 'downloading' | 'failed';
let states: Record<string, LangState> = {};
const subs = new Set<() => void>();
const put = (next: Record<string, LangState>) => { states = next; subs.forEach((f) => f()); };

/** Download state of each search language, kept current. */
export function useLangStates() {
  const [s, set] = useState(states);
  useEffect(() => {
    const f = () => set(states);
    subs.add(f);
    f();
    return () => { subs.delete(f); };
  }, []);
  return s;
}

/** Search languages besides English (empty off Android): the profile's, or the phone's language until changed in Settings. */
export function searchLangs(p: Profile = profileNow()): string[] {
  if (!QT) return [];
  if (p.searchLangs) return p.searchLangs;
  const d = QT.deviceLanguage();
  return d && d !== 'en' ? [d] : [];
}

let names: Map<string, string> | null = null;
export const langName = (code: string) => (names ??= new Map((QT?.languages() ?? []).map((l) => [l.code, l.name]))).get(code) ?? code;

/** Downloads missing search languages, retries failed ones and deletes unchecked ones (app start, Settings). */
export async function syncLangs() {
  if (!QT) return;
  const want = searchLangs(await getProfile());
  const have = new Set(await QT.downloaded().catch(() => [] as string[]));
  for (const l of have) if (l !== 'en' && !want.includes(l)) QT.remove(l).catch((e) => console.warn('[queryLang] remove failed:', e));
  const next: Record<string, LangState> = {};
  for (const l of want) next[l] = have.has(l) ? 'ready' : 'downloading';
  put(next);
  for (const l of want) {
    if (have.has(l) || inFlight.has(l)) continue;
    inFlight.add(l);
    QT.download(l).then(
      () => { inFlight.delete(l); if (l in states) put({ ...states, [l]: 'ready' }); },
      (e) => { inFlight.delete(l); console.warn('[queryLang] download failed:', l, e); if (l in states) put({ ...states, [l]: 'failed' }); },
    );
  }
}
const inFlight = new Set<string>();

export async function setSearchLangs(langs: string[]) {
  await setProfile({ searchLangs: langs });
  await syncLangs();
}

export type Expanded = {
  /** the query first, then its emoji-as-words and English versions */
  texts: string[];
  /** search languages this query may be in that aren't downloaded yet */
  pending: string[];
};
const cache = new Map<string, Promise<Expanded>>();

/** The CLIP words to search for clip: as typed, emoji as words, and translated from the user's search languages. */
export function expandQuery(clip: string): Promise<Expanded> {
  const langs = searchLangs();
  const ready = langs.filter((l) => states[l] === 'ready');
  const key = `${clip}|${langs}|${ready}`; // a finished download searches again
  if (!cache.has(key)) cache.set(key, expand(clip, langs, ready));
  return cache.get(key)!;
}

async function expand(clip: string, langs: string[], ready: string[]): Promise<Expanded> {
  const words = emojiToWords(clip);
  const texts = words && words !== clip ? [clip, words] : [clip];
  const done = (pending: string[] = []) => ({ texts, pending });
  const qt = QT;
  if (!qt || !langs.length || !words) return done();
  const ids = await qt.identify(words).catch(() => []);
  if (ids[0]?.lang === 'en' && ids[0].conf >= 0.8) return done();
  // the search languages language ID thinks it could be, else all of them (short words fool it: "kar")
  const ranked = ids.map((i) => i.lang.split('-')[0]).filter((l) => langs.includes(l));
  const from = ranked.length ? ranked : langs;
  const out = await Promise.all(from.filter((l) => ready.includes(l)).map((l) => qt.toEnglish(words, l).catch(() => '')));
  for (const s of out) {
    const x = s.trim().toLowerCase();
    if (x && !texts.some((t) => t.toLowerCase() === x)) texts.push(x);
  }
  return done(from.filter((l) => !ready.includes(l)));
}
