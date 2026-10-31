// First-run onboarding (design: "PicDump Onboarding", 30 screens in 7 phases): which screen follows which, the answers, and the numbers screen 5 shows.

/** What the OS gave: everything, only the photos the user picked, or nothing. */
export type Access = 'full' | 'limited' | 'denied';

/** '1' ... '30', and '4b' (limited or no access). */
export type StepId = string;
const NUMS: StepId[] = Array.from({ length: 30 }, (_, i) => String(i + 1));
export const STEPS: readonly StepId[] = [...NUMS.slice(0, 4), '4b', ...NUMS.slice(4)];
export const isStep = (s: unknown): s is StepId => STEPS.includes(s as StepId);

/** The style screens the recap (19) can send back to; finishing one returns there instead of going on. */
export const STYLE_STEPS: readonly StepId[] = ['13', '14', '15', '16', '17'];

/** Back is on every screen after 1 except 4b and 5 (the permission result is in), the paywall (close only) and done. */
export function hasBack(s: StepId, access: Access | null = 'full'): boolean {
  if (['1', '4b', '5', '29', '30'].includes(s)) return false;
  return !(s === '6' && access !== 'full');
}

/** Fewer shared photos than this (limited access) can't make dumps: screen 4b asks for more instead of letting them continue. */
export const MIN_SHARED = 30;

/** What this phone can do: run the on-device index (search, stories), and Tidy (Android 11+ Trash). */
export type Caps = { index?: boolean; tidy?: boolean };

/** Screens that read photos are left out when they can't be read (design: Branches). Clutter needs Tidy, search needs the index. */
export function skipped(s: StepId, access: Access | null, caps: Caps = {}): boolean {
  const no = access !== 'full';
  if (s === '5') return access === 'denied';
  if (s === '12' || s === '20' || s === '21') return no;
  if (s === '22') return no || caps.tidy === false || caps.index === false;
  if (s === '23') return no || caps.index === false;
  return false;
}

/** The screen after cur. editing: cur was opened from the recap's chips, so finishing it goes back there. */
export function nextStep(cur: StepId, access: Access | null, opts: Caps & { editing?: boolean } = {}): StepId {
  if (opts.editing && STYLE_STEPS.includes(cur)) return '19';
  // denied: PicDump can't work without photos, so the question stays (screen 4 turns into "open Settings")
  if (cur === '4') return access === 'full' ? '5' : access === 'limited' ? '4b' : '4';
  let i = NUMS.indexOf(cur === '4b' ? '4' : cur) + 1;
  while (i < NUMS.length && skipped(NUMS[i], access, opts)) i++;
  return NUMS[i] ?? '30';
}

/** The progress bar fills from screen 6 to 27 (22 steps); hidden before and after (design: Progress). */
export const inProgress = (s: StepId): boolean => { const n = parseInt(s, 10); return n >= 6 && n <= 27; };
export function progressOf(s: StepId): number {
  const n = parseInt(s, 10);
  return n >= 6 && n <= 27 ? (n - 5) / 22 : n > 27 ? 1 : 0;
}

/** Screen 5's wording: Limited access, or by library size (none, under FEW_PHOTOS, 1,000+, the rest). */
export type LibrarySize = 'limited' | 'empty' | 'few' | 'mid' | 'large';
/** Fewer photos than this make small dumps: screen 5 says so (it doesn't stop them). */
export const FEW_PHOTOS = 100;
export function librarySize(count: number, access: Access | null): LibrarySize {
  if (access === 'limited') return 'limited';
  return count === 0 ? 'empty' : count < FEW_PHOTOS ? 'few' : count >= 1000 ? 'large' : 'mid';
}

/** "Mar 2019 – Oct 2026", or "Aug – Oct 2026" inside one year; one month alone when both ends fall in it. */
export function dateSpan(from: number, to: number, locale?: string): string {
  const a = new Date(Math.min(from, to)), b = new Date(Math.max(from, to));
  const month = (d: Date) => d.toLocaleDateString(locale, { month: 'short' });
  const full = (d: Date) => d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
  if (a.getFullYear() === b.getFullYear()) return a.getMonth() === b.getMonth() ? full(b) : `${month(a)} – ${full(b)}`;
  return `${full(a)} – ${full(b)}`;
}

// ---- the answers (screens 6-27) ----

export const POSTS = ['ig-feed', 'ig-stories', 'tiktok', 'me'] as const;
export const FREQS = ['daily', 'few', 'weekly', 'rarely'] as const;
export const TOPICS = ['trips', 'daily', 'friends', 'food', 'pets', 'all'] as const;
export const LASTS = ['week', 'month', 'months', 'never'] as const;
export const PAINS = ['many', 'choose', 'edit', 'caption', 'dupes', 'forget'] as const;
export const LAYOUTS = ['one', 'split', 'bento', 'grid', 'scrap'] as const;
export const RATIOS = ['4:5', '9:16', '1:1', '3:4'] as const;
export const FITS = ['fill', 'matte', 'blur'] as const;
export const MATTES = ['card', 'cream', 'kraft'] as const;
export const VOICES = ['plain', 'playful', 'none'] as const;
export const LOOKS = ['warm', 'cashmere', 'soft', 'sunfade', 'bw', 'orig'] as const;
export const TIMES = ['7 PM', '8 PM', '9 PM', '10 PM'] as const;

/** The app's own look keys (services/filters.ts) for the looks shown here; Pro is every look but Warm 35mm and Original. */
export const LOOK_KEY = { warm: 'warm35', cashmere: 'cashmere', soft: 'grain', sunfade: 'sunfade', bw: 'noir', orig: 'none' } as const;
export const isProLook = (l: string): boolean => l !== 'warm' && l !== 'orig';

/** The default shape follows where they post, until they pick one themselves. */
export const POST_RATIO: Record<string, string> = { 'ig-feed': '4:5', 'ig-stories': '9:16', tiktok: '9:16', me: '4:5' };

export type Answers = {
  post: string | null;
  freq: string | null;
  topics: string[];
  last: string | null;
  pains: string[];
  size: number;
  ratio: string;
  ratioTouched: boolean;
  layout: string;
  look: string;
  fit: string;
  matte: string;
  voice: string;
  /** the selfie step: 'me' (that's me), 'not' (not me or none found), null = skipped */
  selfie: 'me' | 'not' | null;
  name: string;
  /** recap time, and whether Sunday's weekly recap is on */
  time: string;
  weekly: boolean;
  /** null = not asked yet */
  notif: boolean | null;
  plan: 'annual' | 'monthly';
};

export const START: Answers = {
  post: null, freq: null, topics: [], last: null, pains: [], size: 6, ratio: '4:5', ratioTouched: false, layout: 'scrap', look: 'warm', fit: 'matte',
  matte: 'card', voice: 'plain', selfie: null, name: '', time: '8 PM', weekly: true, notif: null, plan: 'annual',
};

/** One answer set. Picking where they post sets the shape too, until the shape is picked by hand. */
export function setAnswer(a: Answers, key: keyof Answers, value: unknown): Answers {
  const next = { ...a, [key]: value } as Answers;
  if (key === 'post' && !a.ratioTouched) next.ratio = POST_RATIO[value as string] ?? '4:5';
  if (key === 'ratio') next.ratioTouched = true;
  return next;
}

/** A multi-select toggle: "Everything" clears the others, and any other pick clears "Everything" (design: topics). */
export function toggleAnswer(list: string[], id: string): string[] {
  if (id === 'all') return list.includes('all') ? [] : ['all'];
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  return next.filter((x) => x !== 'all');
}

/** The hour (24h) of a "8 PM" time pill. */
export const hourOf = (time: string): number => 12 + (parseInt(time, 10) % 12);
