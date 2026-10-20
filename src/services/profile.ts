import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local profile and settings until Instagram / TikTok can be connected (decisions.md "Identity"). Edited in Profile.
 * avatar: file uri of a chosen photo ('' = initial letter). ratio / fit: what new dumps start with.
 * highRes: export slides at 2160 px instead of 1080. dev: developer tools unlocked (5 taps on the version).
 */
export type Profile = { name: string; handle: string; bio: string; avatar: string; ratio: string; fit: 'bleed' | 'border'; highRes: boolean; dev: boolean };

const KEY = '@daydump_profile';
const EMPTY: Profile = { name: '', handle: '', bio: '', avatar: '', ratio: '4:5', fit: 'bleed', highRes: false, dev: false };

let last = EMPTY;
/** The profile as last read or written (sync, for code that can't wait; EMPTY before the first read). */
export const profileNow = () => last;

export async function getProfile(): Promise<Profile> {
  try {
    return (last = { ...EMPTY, ...JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') });
  } catch {
    return EMPTY;
  }
}

let queue: Promise<unknown> = Promise.resolve();
/** Merges and saves. Writes run one after another, so two quick changes to different fields both stick. */
export function setProfile(p: Partial<Profile>): Promise<Profile> {
  const run = queue.then(async () => {
    const next = { ...(await getProfile()), ...p };
    last = next;
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return next;
  });
  queue = run.catch(() => {});
  return run;
}
