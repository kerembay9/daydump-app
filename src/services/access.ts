import type { Story } from './stories';
import { isUnlocked, Unlocks } from './unlocks';

export type Access = 'open' | 'locked';

/** Whether a Discover story's picks show. First match wins: the 8 PM recap, Pro, this story's free unlock. */
export function access(story: Pick<Story, 'id' | 'kind'>, isPro: boolean, unlocks: Unlocks): Access {
  if (story.kind === 'today') return 'open';
  if (isPro) return 'open';
  return isUnlocked(unlocks, story.id) ? 'open' : 'locked';
}
