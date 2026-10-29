import type { Story } from './stories';
import { isUnlocked, Unlocks } from './unlocks';

export type Access = 'open' | 'locked';

/** Recaps are free: the 8 PM daily dump and the week / month / year recaps (the Sunday notification opens the week's). */
const FREE_KINDS: ReadonlySet<Story['kind']> = new Set(['today', 'recap']);

/** Whether a Discover story's picks show. First match wins: a recap, Pro, this story's free unlock. */
export function access(story: Pick<Story, 'id' | 'kind' | 'start' | 'end'>, isPro: boolean, unlocks: Unlocks): Access {
  if (FREE_KINDS.has(story.kind)) return 'open';
  if (isPro) return 'open';
  return isUnlocked(unlocks, story) ? 'open' : 'locked';
}
