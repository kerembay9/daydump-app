// Caption ideas for Size & Edit: ~6 templates from what the dump is about. No network, no model. Pure (selfcheck).
import { dateRange, plural, seasonOf } from './stories/titles';

export type CaptionInput = {
  /** story kind; 'dump' = made in Create / shared in */
  kind: 'trip' | 'topic' | 'search' | 'today' | 'dump';
  title: string;
  /** trips: "City, CC" */
  place?: string;
  concepts?: string[];
  start: number;
  end: number;
  count: number;
};

/** What a dump's captions are built from: its story when it has one, else a plain dump; dates from its own photos. */
export function captionInput(
  d: { title: string; created: number; photos: { created?: number }[] },
  story?: { kind: CaptionInput['kind']; title: string; place?: string; concepts?: string[] },
): CaptionInput {
  const ts = d.photos.map((p) => p.created).filter((x): x is number => !!x); // 0 = no date (WhatsApp images in old indexes)
  const [start, end] = ts.length ? [Math.min(...ts), Math.max(...ts)] : [d.created, d.created];
  return story
    ? { kind: story.kind, title: story.title, place: story.place, concepts: story.concepts, start, end, count: d.photos.length }
    : { kind: 'dump', title: d.title, start, end, count: d.photos.length };
}

const clean = (s: string) => s.replace(/\s*\(.*?\)/g, '').replace(/,.*$/, '').replace(/^(a|an) /i, '').trim();
const tag = (s: string) => '#' + s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Six ideas, best first, all different. */
export function captionIdeas(c: CaptionInput, now = Date.now()): string[] {
  const range = dateRange(c.start, c.end, now);
  const season = seasonOf((c.start + c.end) / 2);
  const title = c.title.replace(/\s*\(.*?\)/g, '').trim().toLowerCase();
  let ideas: string[];
  if (c.kind === 'trip') {
    const city = clean(c.place ?? c.title).replace(/^(week|weekend|day|few days|month) in /i, '').toLowerCase();
    ideas = [
      `${title} ✈️`,
      'out of office, fully in camera roll 📸',
      `${range} in ${city}. these are the keepers 🎞️`,
      `postcards from ${city}, holding onto golden hour a little longer ✨`,
      `${c.count} photos and still not over ${city} 🌿`,
      `camera roll still stuck in ${city} 🗺️`,
    ];
  } else if (c.kind === 'today') {
    const weekday = new Date(c.end).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    ideas = [
      `today, in ${c.count} photos ☀️`,
      `${weekday} dump 🎞️`,
      'a day worth keeping ✨',
      `little things from ${weekday} 🤍`,
      'proof today happened 📸',
      `${range}, unfiltered, mostly 🌿`,
    ];
  } else if (c.kind === 'dump') {
    ideas = [
      `photo dump · ${range} 🎞️`,
      'lately ✨',
      `${range}, in no particular order 📸`,
      `a few keepers from ${season} 🤍`,
      'camera roll clean-out 🧺',
      'little moments, big feelings ✨',
    ];
  } else {
    const subject = c.concepts?.[0] ? plural(clean(c.concepts[0])).toLowerCase() : title;
    ideas = [
      `${subject} season 🎞️`,
      `${c.count} photos of ${subject} and not a single regret`,
      `${range}, told in ${subject} ✨`,
      `a little ${subject} dump 🤍`,
      `lately: ${subject}, mostly 📸`,
      `${season} was mostly ${subject} 🌿`,
    ];
  }
  return [...new Set(ideas)];
}

/** A few hashtags to paste under the caption. */
export function hashtags(c: CaptionInput): string[] {
  const words = [
    c.kind === 'trip' ? clean(c.place ?? '') : '',
    ...(c.concepts ?? []).slice(0, 2).map(clean),
    seasonOf((c.start + c.end) / 2),
  ];
  return [...new Set(['#photodump', ...words.filter(Boolean).map(tag), '#daydump'])].filter((t) => t.length > 1).slice(0, 5);
}

/** What Copy puts on the clipboard. */
export const clipText = (caption: string, tags: string[]) => `${caption}\n\n${tags.join(' ')}`;
