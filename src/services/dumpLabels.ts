// Pure text for dumps (Library rows, search, Reuse titles). No native imports, so scripts/selfcheck.ts can test it.
import type { Dump } from './dumps';
import { dateRange } from './stories/titles';
import { LAYOUTS } from './layouts';

const DAY = 86_400_000;

/** Dump ids start with "d_"; anything else on the edit/preview routes is a Discover story id. */
export const isDumpId = (id?: string) => !!id?.startsWith('d_');
const PLATFORM: Record<string, string> = { instagram: 'IG', 'instagram-story': 'IG Story', 'instagram-reel': 'IG Reel', tiktok: 'TikTok' };
const day = (t: number) => new Date(t).setHours(0, 0, 0, 0);

/** Reuse copy name: "{title} (2)", or the next free number ("Trip (2)" reused again -> "Trip (3)"). */
export function copyTitle(title: string, taken: string[]): string {
  const base = title.replace(/ \(\d+\)$/, '');
  for (let n = 2; ; n++) if (!taken.includes(`${base} (${n})`)) return `${base} (${n})`;
}

/** "Dump · 4:5", or "Collage · 2×2 Grid" once a multi-photo layout is picked. */
export const kindLabel = (d: Pick<Dump, 'layout' | 'ratio'>) =>
  d.layout && d.layout !== 'single' ? `Collage · ${LAYOUTS.find((l) => l.key === d.layout)?.label ?? d.layout}` : `Dump · ${d.ratio}`;

/** Date range of the photos ("May 12–18"), or the day the dump was made when no photo carries a date. */
export function photoRange(d: Pick<Dump, 'photos' | 'created'>, now = Date.now()): string {
  const ts = d.photos.map((p) => p.created).filter((t): t is number => !!t); // 0 = no date
  return ts.length ? dateRange(Math.min(...ts), Math.max(...ts), now) : dateRange(d.created, d.created, now);
}

/** "Shared to IG · Sep 29" / "Edited today" / "Edited yesterday" / "Edited Sep 12". */
export function statusLine(d: Pick<Dump, 'status' | 'platform' | 'postedAt' | 'edited'>, now = Date.now()): string {
  if (d.status === 'posted') {
    const t = d.postedAt ?? d.edited;
    return `Shared${d.platform ? ` to ${PLATFORM[d.platform] ?? d.platform}` : ''} · ${dateRange(t, t, now)}`;
  }
  const days = Math.round((day(now) - day(d.edited)) / DAY);
  return `Edited ${days <= 0 ? 'today' : days === 1 ? 'yesterday' : dateRange(d.edited, d.edited, now)}`;
}

/** Library row meta, two lines so the status (where / when it was shared) is never the part cut off. */
export const metaLines = (d: Dump, now = Date.now()) =>
  [`${d.photos.length} photo${d.photos.length === 1 ? '' : 's'} · ${photoRange(d, now)}`, statusLine(d, now)] as const;

/** One-line form: "{n} photos · {date} · {status}" (same order as Discover's meta). */
export const rowLine = (d: Dump, now = Date.now()) => metaLines(d, now).join(' · ');

/** Library search: every word must appear in the title, kind, dates, status or caption. */
export function matches(d: Dump, query: string, now = Date.now()): boolean {
  const hay = `${d.title} ${kindLabel(d)} ${rowLine(d, now)} ${d.caption ?? ''}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
