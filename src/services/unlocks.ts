import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Free tier: one Discover dump unlocked per rolling 7 days (docs/superpowers/specs/2026-10-28-monetization-design.md).
 * lastAt = when the last one was spent; ids = every story unlocked so far (they stay open). Unused weeks don't bank.
 * The picks themselves are the story's Library draft, made when it's unlocked (Pro.tsx), so a re-index can't change them.
 */
export type Unlocks = { lastAt: number | null; ids: string[] };
export const NO_UNLOCKS: Unlocks = { lastAt: null, ids: [] };
export const UNLOCK_EVERY = 7 * 86_400_000;

export const nextUnlockAt = (u: Unlocks) => (u.lastAt == null ? 0 : u.lastAt + UNLOCK_EVERY);
export const canUnlock = (u: Unlocks, now: number) => now >= nextUnlockAt(u);
export const isUnlocked = (u: Unlocks, storyId: string) => u.ids.includes(storyId);
/** Whole days until the next free unlock, rounded up; 0 = one is free now. */
export const daysLeft = (u: Unlocks, now: number) => Math.max(0, Math.ceil((nextUnlockAt(u) - now) / 86_400_000));

/** Spends this week's unlock on storyId. Throws when none is free; a story already unlocked costs nothing. */
export function unlock(u: Unlocks, storyId: string, now: number): Unlocks {
  if (isUnlocked(u, storyId)) return u;
  if (!canUnlock(u, now)) throw new Error('no free unlock');
  return { lastAt: now, ids: [...u.ids, storyId] };
}

const KEY = '@picdump_unlocks';
export async function loadUnlocks(): Promise<Unlocks> {
  try {
    return { ...NO_UNLOCKS, ...JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') };
  } catch {
    return NO_UNLOCKS;
  }
}
export const saveUnlocks = (u: Unlocks) => AsyncStorage.setItem(KEY, JSON.stringify(u));
