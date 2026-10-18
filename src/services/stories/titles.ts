import type { Topic } from './topics';

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function topicTitle(t: Pick<Topic, 'name' | 'start' | 'end'>): string {
  const spanDays = (t.end - t.start) / DAY;
  const name = t.name.replace(/^(a|an) /, '');
  if (spanDays <= 2) return `${capitalize(name)}, ${fmtDay(t.start)}`;
  if (spanDays <= 21) return `${capitalize(name)} · ${dateRange(t.start, t.end)}`;
  const season = seasonOf((t.start + t.end) / 2);
  if (spanDays <= 120 && seasonOf(t.start) === seasonOf(t.end)) {
    if (name.startsWith('wearing ')) return capitalize(`${article(name.slice(8))} ${name.slice(8)} ${season}`); // "A red winter"
    return capitalize(`${article(season)} ${season} of ${plural(name)}`);
  }
  return `${capitalize(plural(name))} · ${dateRange(t.start, t.end)}`;
}

export function plural(w: string): string {
  if (/^wearing |colors$|s$/.test(w)) return w;
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

export function dateRange(a: number, b: number): string {
  const A = new Date(a), B = new Date(b);
  const yr = B.getFullYear() !== new Date().getFullYear() ? ` ${B.getFullYear()}` : '';
  if (A.toDateString() === B.toDateString()) return fmtDay(a) + yr;
  if (B.getTime() - A.getTime() > 45 * DAY) return `${MONTHS[A.getMonth()]}–${MONTHS[B.getMonth()]}${yr}`;
  return `${fmtDay(a)}–${fmtDay(b)}${yr}`;
}

const article = (w: string) => (/^[aeiou]/.test(w) ? 'an' : 'a');
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
