import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local profile and settings until Instagram / TikTok can be connected (decisions.md "Identity"). Edited in Profile.
 * avatar: file uri of a chosen photo ('' = initial letter). ratio: what new dumps start with.
 * exportHD: export slides at 2160 px (HD, the default) instead of 1080; Preview can switch it per dump. dev: developer tools unlocked (5 taps on the version).
 * hideSensitive: IDs, bank cards and medical papers stay out of stories (stories/curate.ts). screenshots: Screenshots-folder photos can be in stories (off by default).
 * searchLangs: search languages besides English (index/queryLang.ts); null = the phone's language.
 * saveOnPost: Post also saves the slides to the PicDump album (Save only always does).
 */
export type Profile = { name: string; handle: string; bio: string; avatar: string; ratio: string; exportHD: boolean; dev: boolean; hideSensitive: boolean; screenshots: boolean; searchLangs: string[] | null; saveOnPost: boolean };

const KEY = '@daydump_profile';
const EMPTY: Profile = { name: '', handle: '', bio: '', avatar: '', ratio: '4:5', exportHD: true, dev: false, hideSensitive: true, screenshots: false, searchLangs: null, saveOnPost: true };

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
    subs.forEach((f) => f(next));
    return next;
  });
  queue = run.catch(() => {});
  return run;
}

const subs = new Set<(p: Profile) => void>();
/** The profile, kept current: re-renders on every setProfile (onboarding saves the name and avatar over Home, no refocus). */
export function useProfile() {
  const [p, setP] = useState(last);
  useEffect(() => {
    subs.add(setP);
    getProfile().then(setP);
    return () => { subs.delete(setP); };
  }, []);
  return p;
}
