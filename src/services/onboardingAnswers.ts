import AsyncStorage from '@react-native-async-storage/async-storage';
import { setProfile } from './profile';
import type { Answers } from './onboardingFlow';

/** Everything the onboarding asked, kept for the defaults that read it later (look, layout, frame, caption voice, size). */
export const ANSWERS_KEY = '@picdump_onboarding_answers';

/**
 * At the end of onboarding: the answers are kept as one record, and the ones the app already has a setting for are applied now
 * (the shape is the Profile's default ratio; the name was saved when it was typed). The rest wait in the record: nothing reads
 * look, layout, frame, voice or the per-dump size from it yet.
 */
export async function saveAnswers(a: Answers): Promise<void> {
  await AsyncStorage.setItem(ANSWERS_KEY, JSON.stringify(a));
  await setProfile({ ratio: a.ratio });
}

export async function savedAnswers(): Promise<Answers | null> {
  try {
    const raw = await AsyncStorage.getItem(ANSWERS_KEY);
    return raw ? (JSON.parse(raw) as Answers) : null;
  } catch {
    return null;
  }
}
