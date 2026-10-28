import type { Topic } from './topics';

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Topic name without dates (the date range is on the meta line): "Coffee", "An autumn of cinnamon rolls". */
export function topicTitle(t: Pick<Topic, 'name' | 'start' | 'end'>): string {
  const spanDays = (t.end - t.start) / DAY;
  // vocab disambiguators go: "letter (message)" -> "letter"
  const name = t.name.replace(/\s*\(.*?\)/g, '').replace(/^(a|an) /, '');
  if (spanDays <= 21) return capitalize(name);
  const season = seasonOf((t.start + t.end) / 2);
  if (spanDays <= 120 && seasonOf(t.start) === seasonOf(t.end)) {
    if (name.startsWith('wearing ')) return capitalize(`${article(name.slice(8))} ${name.slice(8)} ${season}`); // "A red winter"
    return capitalize(`${article(season)} ${season} of ${plural(name)}`);
  }
  return capitalize(plural(name));
}

// irregular plurals and mass nouns among the vocab's last words: "woman" -> "women", "street food" stays
const IRREGULAR: Record<string, string> = {
  man: 'men', woman: 'women', gentleman: 'gentlemen', child: 'children', person: 'people', foot: 'feet', tooth: 'teeth',
  mouse: 'mice', knife: 'knives', leaf: 'leaves', wolf: 'wolves', shelf: 'shelves', life: 'lives', potato: 'potatoes', hero: 'heroes',
};
const UNCOUNTABLE = new Set(
  ('fish sheep deer salmon cattle aircraft sushi food art music coffee tea rice milk water juice bread wine beer candy grain ' +
    'equipment furniture clothing jewelry hair grass sand ice snow rain fog money traffic wildlife police').split(' '),
);

export function plural(w: string): string {
  const last = w.match(/[^\s-]+$/)?.[0] ?? '';
  if (IRREGULAR[last]) return w.slice(0, -last.length) + IRREGULAR[last];
  if (UNCOUNTABLE.has(last) || /^wearing |colors$|s$/.test(w)) return w;
  if (/(sh|ch|x)$/.test(w)) return w + 'es';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  return w + 's';
}

export function seasonOf(t: number): string {
  return ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][new Date(t).getMonth()];
}

export function fmtDay(t: number) {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Photo date range for meta lines (local days): "May 18", "May 12–18", "May 28–Jun 2", "Sep–Nov"; the year only when
 * it isn't this year ("May 12–18, 2024", "Sep–Nov 2024"); "Dec 2024–Mar 2025" across years; "2023–2025" past 12 months.
 */
export function dateRange(a: number, b: number, now = Date.now()): string {
  const A = new Date(Math.min(a, b)), B = new Date(Math.max(a, b));
  const [ya, yb] = [A.getFullYear(), B.getFullYear()];
  const [ma, mb] = [MONTHS[A.getMonth()], MONTHS[B.getMonth()]];
  const span = (B.getTime() - A.getTime()) / DAY;
  const yr = yb !== new Date(now).getFullYear() ? yb : null;
  if (span > 365) return `${ya}–${yb}`;
  if (span > 45) return ya !== yb ? `${ma} ${ya}–${mb} ${yb}` : `${ma}–${mb}${yr ? ` ${yr}` : ''}`;
  const y = yr ? `, ${yr}` : '';
  if (A.toDateString() === B.toDateString()) return `${fmtDay(A.getTime())}${y}`;
  if (ma === mb && ya === yb) return `${ma} ${A.getDate()}–${B.getDate()}${y}`;
  return `${fmtDay(A.getTime())}–${fmtDay(B.getTime())}${y}`;
}

/**
 * Same title twice in the list ("Coffee", "Coffee") -> add the first of year / season + year / date range that
 * tells the group apart: "Coffee, 2024" / "Coffee, 2025"; "Coffee, spring 2025" / "Coffee, autumn 2025".
 */
export function disambiguate<T extends { title: string; start: number; end: number }>(items: T[], now = Date.now()): T[] {
  const groups = new Map<string, T[]>();
  for (const s of items) (groups.get(s.title) ?? groups.set(s.title, []).get(s.title)!).push(s);
  const mid = (s: T) => new Date((s.start + s.end) / 2);
  const suffixes = [
    (s: T) => `${mid(s).getFullYear()}`,
    (s: T) => `${seasonOf(mid(s).getTime())} ${mid(s).getFullYear()}`,
    (s: T) => dateRange(s.start, s.end, now),
  ];
  const renamed = new Map<T, string>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const f = suffixes.find((fn) => new Set(g.map(fn)).size === g.length) ?? suffixes[2];
    g.forEach((s) => renamed.set(s, `${s.title}, ${f(s)}`));
  }
  return items.map((s) => (renamed.has(s) ? { ...s, title: renamed.get(s)! } : s));
}

const article = (w: string) => (/^[aeiou]/.test(w) ? 'an' : 'a');
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
