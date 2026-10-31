import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveAnswers, savedAnswers } from '../src/services/onboardingAnswers';
import { setAnswer, START } from '../src/services/onboardingFlow';
import { getProfile } from '../src/services/profile';

beforeEach(() => AsyncStorage.clear());

test('the answers are kept as one record and the shape becomes the Profile default', async () => {
  expect(await savedAnswers()).toBeNull();
  const a = setAnswer(setAnswer(START, 'post', 'ig-stories'), 'look', 'sunfade');
  await saveAnswers(a);
  expect(await savedAnswers()).toEqual(a);
  expect((await getProfile()).ratio).toBe('9:16');
});
