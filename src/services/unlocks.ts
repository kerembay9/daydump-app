import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Free tier: one Discover dump unlocked per rolling 7 days (docs/superpowers/specs/2026-10-28-monetization-design.md).
 * lastAt = when the last one was spent; ids = every story unlocked so far (they stay open), spans = each one's
 * [start, end] when it was unlocked. Unused weeks don't bank.
 * The picks themselves are the story's Library draft, made when it's unlocked (Pro.tsx), so a re-index can't change them.
 */
export type Unlocks = { lastAt: number | null; ids: string[]; spans: Record<string, [number, number]> };
export const NO_UNLOCKS: Unlocks = { lastAt: null, ids: [], spans: {} };
export const UNLOCK_EVERY = 7 * 86_400_000;

/** What identifies a story across re-indexes: its id, and the time it covers. */
export type StorySpan = { id: string; start: number; end: number };

/** The id without its start date: `trip:Seattle:<start>` → `trip:Seattle`, `topic:7:<start>` → `topic:7`. */
const seriesOf = (id: string) => {
  const parts = id.split(':');
  return parts.length < 3 ? id : parts.slice(0, -1).join(':');
};

/**
 * The unlocked id this story is, or null. Ids carry the earliest photo's time, so indexing more (newest first),
 * a settings change or a deleted photo re-ids the same story: the same series over an overlapping time still counts.
 */
export function unlockedAs(u: Unlocks, s: StorySpan): string | null {
  if (u.ids.includes(s.id)) return s.id;
  const series = seriesOf(s.id);
  for (let i = u.ids.length - 1; i >= 0; i--) {
    const id = u.ids[i];
    const span = u.spans[id];
    if (span && seriesOf(id) === series && span[0] <= s.end && s.start <= span[1]) return id;
  }
  return null;
}

export const nextUnlockAt = (u: Unlocks) => (u.lastAt == null ? 0 : u.lastAt + UNLOCK_EVERY);
export const canUnlock = (u: Unlocks, now: number) => now >= nextUnlockAt(u);
export const isUnlocked = (u: Unlocks, s: StorySpan) => unlockedAs(u, s) != null;
/** Whole days until the next free unlock, rounded up; 0 = one is free now. */
export const daysLeft = (u: Unlocks, now: number) => Math.max(0, Math.ceil((nextUnlockAt(u) - now) / 86_400_000));

/** Spends this week's unlock on a story. Throws when none is free; a story already unlocked costs nothing. */
export function unlock(u: Unlocks, s: StorySpan, now: number): Unlocks {
  if (isUnlocked(u, s)) return u;
  if (!canUnlock(u, now)) throw new Error('no free unlock');
  return { lastAt: now, ids: [...u.ids, s.id], spans: { ...u.spans, [s.id]: [s.start, s.end] } };
}

const KEY = '@picdump_unlocks';
export async function loadUnlocks(): Promise<Unlocks> {
  try {
    // saves from before spans: ids still match exactly
    return { ...NO_UNLOCKS, ...JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') };
  } catch {
    return NO_UNLOCKS;
  }
}
export const saveUnlocks = (u: Unlocks) => AsyncStorage.setItem(KEY, JSON.stringify(u));
